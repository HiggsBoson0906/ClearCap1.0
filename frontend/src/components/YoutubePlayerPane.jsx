import React, { useRef } from "react";
import YouTube from "react-youtube";

export default function YouTubePlayerPane({ onVideoLoaded, playerRef }) {
    const extractId = (url) => {
        try {
            const u = new URL(url);
            return u.searchParams.get("v");
        } catch {
            return null;
        }
    };

    const [videoUrl, setVideoUrl] = React.useState("");
    const [videoId, setVideoId] = React.useState("");

    const handleLoadVideo = () => {
        const id = extractId(videoUrl);
        if (!id) return alert("Invalid YouTube URL");

        setVideoId(id);
        onVideoLoaded(videoUrl);
    };

    const opts = {
        playerVars: {
            autoplay: 0,
            controls: 1,
        },
    };

    return (
        <div style={{ marginBottom: "12px" }}>
            <input
                type="text"
                placeholder="Paste YouTube link"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                style={{
                    padding: "6px",
                    width: "70%",
                    background: "#121212",
                    color: "#fff",
                    borderRadius: "6px",
                    border: "1px solid #444",
                }}
            />
            <button
                onClick={handleLoadVideo}
                style={{
                    padding: "6px 10px",
                    marginLeft: "8px",
                    cursor: "pointer",
                }}
            >
                Load Video
            </button>

            {videoId && (
                <YouTube
                    videoId={videoId}
                    opts={opts}
                    onReady={(e) => {
                        // 💥 Critical: store YT player instance
                        playerRef.current = e.target;
                    }}
                    style={{ marginTop: "16px" }}
                />
            )}
        </div>
    );
}
