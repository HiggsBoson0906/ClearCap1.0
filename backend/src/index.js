// src/index.js
const express = require("express");
const { spawn } = require("child_process");
const http = require("http");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const upload = multer(); // memory storage
const videoSessions = new Map(); // videoSessionId -> { sessionId, socketId, languageCode, url }

// Map of sessionId -> socketId so we know which socket to emit to
const sessionSockets = new Map();

const { Server } = require("socket.io");
require("dotenv").config();

// Config
const PORT = process.env.PORT || 5000;
const NLP_BASE_URL = process.env.NLP_BASE_URL || "http://127.0.0.1:8000";

const app = express();
const server = http.createServer(app);
const EMOTION_COLORS = {
    neutral: "#333333",
    happy: "#FFD54F",   // warm yellow
    anger: "#EF5350",   // red
    sad: "#42A5F5",     // blue
    fear: "#AB47BC",    // purple
};

function mapGlossToClips(glossArr) {
    if (!Array.isArray(glossArr)) return [];
    // For now, just turn each gloss token into a fake clip id
    return glossArr.map((token) => `clip_${token}`);
}


// Middlewares
app.use(
    cors({
        origin: "*",
    })
);
app.use(express.json());

// In-memory session store
// sessionId -> { language, mode, createdAt }
const sessions = new Map();

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "node-backend" });
});

/**
 * POST /api/session
 * Create a captioning session
 */
app.post("/api/session", (req, res) => {
    const { language, mode } = req.body || {};

    const sessionId =
        "sess_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8);

    sessions.set(sessionId, {
        language: language || "en-IN",
        mode: mode || "text",
        createdAt: Date.now(),
    });

    // For socket.io, client will connect to http://localhost:PORT
    const wsUrl = `http://localhost:${PORT}`;

    res.json({
        sessionId,
        wsUrl,
    });
});
/**
 * Stub: Here you will later call a real ASR provider.
 * For now, it just returns a dummy transcript.
 */
async function transcribeAudio(buffer) {
    // TODO: replace with actual ASR API call (Whisper, Deepgram, etc.)
    console.log("Received audio buffer of length:", buffer.length);

    // For MVP, return a hard-coded text so you see pipeline working
    return "This is a dummy transcript from the ASR stub.";
}

/**
 * POST /api/asr/transcribe
 * Accepts audio, returns { text }
 */
app.post("/api/asr/transcribe", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file uploaded" });
        }

        const audioBuffer = req.file.buffer;

        const text = await transcribeAudio(audioBuffer);

        return res.json({ text });
    } catch (err) {
        console.error("Error in /api/asr/transcribe:", err.message);
        return res.status(500).json({ error: "ASR failed" });
    }
});


/**
 * POST /api/test-nlp
 * Test route: Node -> NLP service -> back
 * This is what we'll hit from Postman to verify integration.
 */
app.post("/api/youtube/start", async (req, res) => {
    try {
        const { url, audioLanguageCode, captionLanguageCode, sessionId } = req.body || {};

        // ✅ new validation
        if (!url || !audioLanguageCode || !captionLanguageCode || !sessionId) {
            return res.status(400).json({
                error: "url, audioLanguageCode, captionLanguageCode, sessionId are required",
            });
        }

        const socketId = sessionSockets.get(sessionId);
        if (!socketId) {
            return res.status(400).json({ error: "No socket registered for this sessionId" });
        }

        const videoSessionId =
            "vid_" +
            Date.now().toString(36) +
            "_" +
            Math.random().toString(36).slice(2, 8);

        // store both languages for later if needed
        videoSessions.set(videoSessionId, {
            url,
            audioLanguageCode,
            captionLanguageCode,
            sessionId,
            socketId,
            createdAt: Date.now(),
        });

        const pythonPath = "python";              // or "python3"
        const workerScript = "./worker.py";       // adjust if name/path different

        const child = spawn(
            pythonPath,
            [
                workerScript,
                "--video-session-id",
                videoSessionId,
                "--url",
                url,
                "--audio-language-code",
                audioLanguageCode,
                "--caption-language-code",
                captionLanguageCode,
            ],
            {
                cwd: "C:/Users/tmtec/Music/ClearCap/nlp", // 👈 put your real nlp folder here
                stdio: "inherit",
            }
        );

        child.on("exit", (code) => {
            console.log(`YouTube worker for ${videoSessionId} exited with code`, code);
        });

        return res.json({ videoSessionId });
    } catch (err) {
        console.error("Error in /api/youtube/start:", err);
        return res.status(500).json({ error: "Failed to start YouTube processing" });
    }
});



app.post("/api/youtube/segment", (req, res) => {
    try {
        const {
            videoSessionId,
            start,
            end,
            original,
            simplified,
            language,
            emotion,
            islGloss,
        } = req.body || {};

        if (!videoSessionId || !original) {
            return res.status(400).json({ error: "videoSessionId and original text are required" });
        }

        const info = videoSessions.get(videoSessionId);
        if (!info) {
            return res.status(404).json({ error: "Unknown videoSessionId" });
        }

        const { sessionId, socketId } = info;

        const color = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
        const clipIds = mapGlossToClips(islGloss || []);

        const message = {
            type: "caption_final",
            sessionId,
            original,
            simplified: simplified || original,
            language: language || info.languageCode,
            emotion: emotion || "neutral",
            color,
            isl: {
                gloss: islGloss || [],
                clipIds,
            },
            timing: { start, end },
        };

        console.log("Emitting caption_final for videoSessionId:", videoSessionId);
        io.to(socketId).emit("caption_final", message);

        return res.json({ ok: true });
    } catch (err) {
        console.error("Error in /api/youtube/segment:", err);
        return res.status(500).json({ error: "Failed to handle segment" });
    }
});

app.post("/api/test-nlp", async (req, res) => {
    const { text, sourceLang } = req.body || {};

    if (!text) {
        return res.status(400).json({ error: "Field 'text' is required" });
    }

    try {
        const response = await axios.post(`${NLP_BASE_URL}/process`, {
            text,
            sourceLang: sourceLang || "en-IN",
        });

        return res.json({
            ok: true,
            nlpResponse: response.data,
        });
    } catch (err) {
        console.error("Error calling NLP service:", err.message);
        if (err.response) {
            console.error("NLP status:", err.response.status);
            console.error("NLP data:", err.response.data);
        }
        return res.status(500).json({
            ok: false,
            error: "Failed to contact NLP service",
        });
    }
});

// ----- WebSocket (socket.io) setup -----
const io = new Server(server, {
    cors: {
        origin: "*",
    },
});

io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("register_session", (sessionId) => {
        console.log("Registering session", sessionId, "for socket", socket.id);
        sessionSockets.set(sessionId, socket.id);
    });

   
    // Client can send final "transcripts" here (pretend it's ASR output)
    socket.on("transcript_final", async (payload) => {
        try {
            const { text, sessionId } = payload || {};

            if (!text) {
                console.warn("Received transcript without text");
                return;
            }

            const session = sessions.get(sessionId);
            const sourceLang = session?.language || "en-IN";

            console.log(
                `Received transcript for session ${sessionId}:`,
                text.slice(0, 80)
            );

            // Call NLP microservice
            const nlpRes = await axios.post(`${NLP_BASE_URL}/process`, {
                text,
                sourceLang,
            });

            const data = nlpRes.data;

            // Prepare caption_final message
            const color =
                EMOTION_COLORS[data.emotion] || EMOTION_COLORS["neutral"];

            const message = {
                type: "caption_final",
                sessionId,
                original,
                simplified,
                language,
                emotion,
                color,
                isl: { gloss: islGloss, clipIds },
                timing: { start, end },
            };



            // Emit back only to this client for now
            socket.emit("caption_final", message);
        } catch (err) {
            console.error("Error handling transcript_final:", err.message);
        }
    });
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        // Optional: clean up sessionSockets entries with this socketId
        for (const [sessId, sockId] of sessionSockets.entries()) {
            if (sockId === socket.id) {
                sessionSockets.delete(sessId);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Node backend running on http://localhost:${PORT}`);
    console.log(`NLP service base URL: ${NLP_BASE_URL}`);
});
