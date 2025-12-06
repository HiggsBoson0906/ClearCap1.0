import React, { useState, useEffect } from "react";
import "./global.css";
import SplashCursor from "./components/SplashCursor";

import TiltedCard from "./components/TiltedCard";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ChevronDown, Zap, Headphones } from "lucide-react";
import { io } from "socket.io-client";

import YouTubePlayerPane from "./components/YoutubePlayerPane";

// ⭐ BACKEND BASE URL ⭐
// In dev: VITE_API_URL=http://localhost:5000
// In prod (Vercel): VITE_API_URL=https://your-backend.onrender.com
const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

// short code → BCP-47 map
const LANG_MAP = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
};

function ClearCapApp() {
  // UI state
  const [videoUrl, setVideoUrl] = useState(
    "https://www.youtube.com/watch?v=KPD8C7c6P1w"
  );
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [selectedCaptionLanguage, setSelectedCaptionLanguage] =
    useState("en");

  // Backend/session state
  const [sessionId, setSessionId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [ytStatus, setYtStatus] = useState("");
  const [starting, setStarting] = useState(false);

  // Captions + timing
  const [currentCaption, setCurrentCaption] = useState(null);
  const [captions, setCaptions] = useState([]);
  const [videoTime, setVideoTime] = useState(0); // current video time in seconds

  const handleDemoClick = () => {
    const demoSection = document.getElementById("demo");
    demoSection?.scrollIntoView({ behavior: "smooth" });
  };

  // Reset captions when URL changes
  useEffect(() => {
    setVideoTime(0);
    setCurrentCaption(null);
    setCaptions([]);
  }, [videoUrl]);

  // Auto-create session + socket on mount
  useEffect(() => {
    let activeSocket = null;

    const setup = async () => {
      try {
        console.log("👉 Creating session at:", `${API_BASE}/api/session`);

        const res = await fetch(`${API_BASE}/api/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: "en-IN",
            mode: "text+sign",
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error("❌ Failed to create session", res.status, text);
          setYtStatus(`Failed to create session (${res.status})`);
          return;
        }

        const data = await res.json();
        console.log("✅ Session created:", data);

        const newSessionId = data.sessionId;
        setSessionId(newSessionId);

        // 2) Connect socket.io and register session
        const s = io(API_BASE, {
          transports: ["websocket"],
          withCredentials: true,
        });

        s.on("connect", () => {
          console.log("🔌 Socket connected:", s.id);
          s.emit("register_session", newSessionId);
        });

        s.on("disconnect", () => {
          console.log("🔌 Socket disconnected");
        });

        s.on("caption_final", (msg) => {
          console.log("📝 caption_final:", msg);

          const start =
            typeof msg.start === "number"
              ? msg.start
              : msg.timing?.start ?? null;
          const end =
            typeof msg.end === "number"
              ? msg.end
              : msg.timing?.end ?? null;

          const normalized = { ...msg, start, end };

          setCaptions((prev) => {
            const next = [...prev, normalized];
            // sort by start time so we can search cleanly
            next.sort((a, b) => {
              const sa = a.start ?? 0;
              const sb = b.start ?? 0;
              return sa - sb;
            });
            return next;
          });
        });

        activeSocket = s;
        setSocket(s);
      } catch (err) {
        console.error("🔥 Error setting up session/socket:", err);
        setYtStatus("Error setting up session/socket");
      }
    };

    setup();

    return () => {
      if (activeSocket) activeSocket.disconnect();
    };
  }, []);

  // Sync caption to current video time
  useEffect(() => {
    if (!captions.length) {
      setCurrentCaption(null);
      return;
    }

    const t = videoTime;

    let active =
      captions.find(
        (c) =>
          c.start != null && c.end != null && c.start <= t && t < c.end
      ) || null;

    if (!active) {
      const before = captions
        .filter((c) => c.start != null && c.start <= t)
        .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
      active = before[0] || null;
    }

    setCurrentCaption(active);
  }, [videoTime, captions]);

  const handleStart = async () => {
    if (!videoUrl) return;
    if (!sessionId) {
      setYtStatus("Session not ready yet, please wait a moment.");
      return;
    }

    try {
      setStarting(true);
      setYtStatus("Starting processing…");

      const audioLanguageCode = LANG_MAP[selectedLanguage] || "en-IN";
      const captionLanguageCode =
        LANG_MAP[selectedCaptionLanguage] || "en-IN";

      console.log("👉 Starting YouTube processing:", {
        url: videoUrl,
        audioLanguageCode,
        captionLanguageCode,
        sessionId,
      });

      const res = await fetch(`${API_BASE}/api/youtube/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: videoUrl,
          audioLanguageCode,
          captionLanguageCode,
          sessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("❌ YouTube start error:", data);
        throw new Error(data.error || "Failed to start YouTube processing");
      }

      console.log("✅ YouTube processing started:", data);

      setYtStatus(
        `Processing started (ID: ${data.videoSessionId}). Captions will appear as they're ready.`
      );
    } catch (err) {
      console.error("🔥 Error starting YouTube processing:", err);
      setYtStatus("Failed to start. Check backend logs.");
    } finally {
      setStarting(false);
    }
  };

  return (
    
    <div className="min-h-screen bg-background text-foreground">
      < SplashCursor />
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 ">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div >
              
              <img src="./assets/logo.png" alt="ClearCap Logo" width="100" style={{ borderRadius: "15px" }} />

            </div>


            {/* Navigation Links */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#home"
                className="text-foreground hover:text-accent transition-colors font-medium"
              >
                Home
              </a>
              <a
                href="#demo"
                className="text-foreground hover:text-accent transition-colors font-medium"
              >
                Demo
              </a>
              <a
                href="#info"
                className="text-foreground hover:text-accent transition-colors font-medium"
              >
                Info
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        id="home"
        className="relative min-h-screen flex items-center overflow-hidden pt-20"
      >
        {/* Background decorative elements */}
        <div className="absolute top-20 right-10 w-96 h-96 bg-gradient-to-br from-accent/20 to-purple-700/20 rounded-full blur-3xl opacity-30"></div>
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-gradient-to-tr from-purple-600/10 to-accent/10 rounded-full blur-3xl opacity-20"></div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <div>
                <div>
                  <h1 className="text-6xl md:text-7xl lg:text-8xl font-black leading-tight bg-gradient-to-r from-white via-purple-200 to-accent bg-clip-text text-transparent mb-4">
                    ClearCap
                  </h1>

                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-accent via-purple-400 to-pink-400 bg-clip-text text-transparent mb-6">
                    breaking sound barriers
                  </h2>
                </div>

              </div>

              <div className="space-y-4">
                <p className="text-lg md:text-xl text-foreground/90">
                  Real-time multilingual, Deaf-friendly captions for everyone.
                </p>
                <p className="text-base md:text-lg text-muted-foreground">
                  Making content accessible, one word at a time
                </p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  onClick={handleDemoClick}
                  className="button-primary text-lg"
                >
                  START DEMO
                </button>
                <button className="button-secondary text-lg"
                  onClick={() => window.open("https://github.com/HiggsBoson0906/ClearCap1.0", "_blank")}>
                  LEARN MORE
                </button>
              </div>
            </div>
            {/* Right Image */}
            <div className="w-full max-w-md mx-auto">
              <TiltedCard
                imageSrc="/assets/hero-image.png"
                altText="ClearCap - Real-time multilingual, Deaf-friendly captions"
                containerWidth="100%"
                containerHeight="400px"
                imageWidth="100%"
                imageHeight="400px"
                showTooltip={false}
                displayOverlayContent={false} 
              />
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Hero Section */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-5xl md:text-6xl font-black leading-tight text-white">
                Bridging silence with simplicity.
              </h2>
              <p className="text-xl md:text-2xl text-accent font-semibold">
                real time captions for every Indian language
              </p>
              <p className="text-base md:text-lg text-foreground/80">
                Supporting 5+ Indian languages with sub-second latency and
                95%+ accuracy
              </p>
            </div>

            <div className="glass-card p-8 md:p-12">
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Real-time Processing
                    </h3>
                    <p className="text-muted-foreground">
                      Get captions as content plays, with minimal latency
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <Headphones className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Deaf-Friendly Design
                    </h3>
                    <p className="text-muted-foreground">
                      Accessible captions for everyone, everywhere
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="relative py-32 overflow-hidden">
        <div className="absolute -top-40 right-0 w-96 h-96 bg-gradient-to-br from-purple-600/20 to-accent/10 rounded-full blur-3xl opacity-20"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Caption Generator
            </h2>
            <p className="text-lg text-muted-foreground">
              Try our real-time caption system with any YouTube URL
            </p>
          </div>

          {/* Demo Card */}
          <div className="max-w-3xl mx-auto glass-card p-8 md:p-12 mb-4">
            <div className="space-y-6">
              {/* URL Input */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">
                  YouTube URL
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">
                    🔗
                  </span>
                  <input
                    type="text"
                    placeholder="Paste YouTube URL…"
                    className="glass-input w-full pl-12 py-3"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                </div>
              </div>

              {/* Audio Language Selection */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">
                  Audio Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="glass-input w-full py-3"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                </select>
              </div>

              {/* Caption Language Selection */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">
                  Caption Language
                </label>
                <select
                  value={selectedCaptionLanguage}
                  onChange={(e) =>
                    setSelectedCaptionLanguage(e.target.value)
                  }
                  className="glass-input w-full py-3"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="ta">Tamil</option>
                  <option value="te">Telugu</option>
                
                </select>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStart}
                disabled={!videoUrl || starting || !sessionId}
                className="w-full button-primary text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {starting
                  ? "Starting..."
                  : sessionId
                    ? "▶ Start"
                    : "Preparing session…"}
              </button>

              {/* Status */}
              {ytStatus && (
                <p className="text-sm text-muted-foreground mt-2">
                  {ytStatus}
                </p>
              )}
            </div>
          </div>

          {/* Demo Content Grid */}
          <div className="flex flex-col gap-8">
            {/* Video Player */}
            <div className="glass-card p-8 rounded-2xl w-auto border border-white/10">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <span className="text-2xl">📺</span>
                Video Player
              </h3>
              <div className="aspect-video bg-gradient-to-br from-secondary/50 to-secondary/20 rounded-lg flex items-center justify-center border border-white/10 overflow-hidden">
                {videoUrl ? (
                  <YouTubePlayerPane
                    videoUrl={videoUrl}
                    onTimeUpdate={setVideoTime}   // 👈 this line
                  />
                ) : (
                  <div className="text-center">
                    <p className="text-muted-foreground text-lg mb-2">No Video</p>
                    <p className="text-sm text-muted-foreground">
                      Paste a YouTube URL above
                    </p>
                  </div>
                )}
              </div>
              <div className="glass-card rounded-lg border border-white/10">
                {/* Current caption bar */}
                <div className="min-h-[80px] flex flex-col items-center justify-center text-center mb-4">
                  {currentCaption ? (
                    <>
                      <p className="text-lg md:text-2xl font-semibold text-white mb-2">
                        {currentCaption.simplified || currentCaption.original}
                      </p>
                      {currentCaption.original &&
                        currentCaption.simplified &&
                        currentCaption.simplified !==
                        currentCaption.original && (
                          <p className="text-sm text-muted-foreground">
                            Original: {currentCaption.original}
                          </p>
                        )}
                    </>
                  ) : (
                    <p className="text-muted-foreground text-lg">
                      No captions yet
                    </p>
                  )}
                </div>
            </div>
          </div>

          {/* Live Captions */}
          

            {/* History toggle (static for now) */}
            <button className="text-sm text-accent hover:text-accent/80 transition-colors flex items-center gap-2 mx-auto mb-2">
              <ChevronDown className="w-4 h-4" />
              Show recent captions
            </button>

            {/* Recent captions list */}
            {captions.length > 0 && (
              <div className="max-h-40 overflow-y-auto mt-2 space-y-2 text-left text-sm text-muted-foreground">
                {captions.map((c, idx) => {
                  const s =
                    typeof c.start === "number"
                      ? c.start
                      : c.timing?.start ?? null;
                  const e =
                    typeof c.end === "number"
                      ? c.end
                      : c.timing?.end ?? null;

                  return (
                    <div key={idx} className="border-b border-white/5 pb-1">
                      <div className="font-medium text-foreground/90">
                        {c.simplified || c.original}
                      </div>
                      {s != null && e != null && (
                        <div className="text-xs text-muted-foreground/70">
                          {s.toFixed(1)}s – {e.toFixed(1)}s
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section id="info" className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-purple-600/5"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-gradient-to-tr from-accent/20 to-purple-700/20 rounded-full blur-3xl opacity-20"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Why Choose <span className="gradient-text">ClearCap</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Leading the way in accessibility technology for Indian content
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <div className="glass-card p-8 text-center">
              <h3 className="text-4xl md:text-5xl font-black gradient-text mb-4">
                10+
              </h3>
              <p className="text-lg font-semibold text-white">
                Languages Supported
              </p>
              <p className="text-muted-foreground mt-2">
                All major Indian languages covered
              </p>
            </div>
            <div className="glass-card p-8 text-center">
              <h3 className="text-4xl md:text-5xl font-black gradient-text mb-4">
                ISL
              </h3>
              <p className="text-lg font-semibold text-white">
                Sign language
              </p>
              <p className="text-muted-foreground mt-2">
                Sign language support
              </p>
            </div>
            <div className="glass-card p-8 text-center">
              <h3 className="text-4xl md:text-5xl font-black gradient-text mb-4">
                95%+
              </h3>
              <p className="text-lg font-semibold text-white">
                Accuracy Rate
              </p>
              <p className="text-muted-foreground mt-2">
                Highly accurate transcription
              </p>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                Accessibility First
              </h3>
              <p className="text-muted-foreground">
                Designed with Deaf and hard of hearing users in mind, ensuring
                everyone can enjoy content equally
              </p>
            </div>
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                Real-time Processing
              </h3>
              <p className="text-muted-foreground">
                Advanced AI models process audio and generate captions instantly
              </p>
            </div>
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                Multi-language Support
              </h3>
              <p className="text-muted-foreground">
                Seamlessly switch between any of our supported languages
              </p>
            </div>
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                Easy Integration
              </h3>
              <p className="text-muted-foreground">
                Simple API for developers to add captions to their platforms
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="relative py-32 overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-600/10 to-accent/10 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-to-tr from-accent/10 to-purple-700/10 rounded-full blur-3xl opacity-20"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
              Meet Our <span className="gradient-text">Team</span>
            </h2>
            <p className="text-2xl font-semibold text-accent mb-8">
              Trailblazers
            </p>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Passionate developers and accessibility advocates building
              technology that makes the world more inclusive
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ClearCapApp />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
