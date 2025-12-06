// src/components/YouTubePlayerPane.jsx
import React, { useEffect, useRef } from "react";

function extractYouTubeId(url) {
    if (!url) return null;
    try {
        const u = new URL(url);
        if (u.hostname.includes("youtube.com")) {
            return u.searchParams.get("v");
        }
        if (u.hostname.includes("youtu.be")) {
            return u.pathname.replace("/", "");
        }
    } catch (e) {
        const match = url.match(/v=([^&]+)/);
        if (match) return match[1];
    }
    return null;
}

export default function YouTubePlayerPane({ videoUrl, onTimeUpdate }) {
    const containerRef = useRef(null);
    const playerRef = useRef(null);
    const intervalRef = useRef(null);

    const videoId = extractYouTubeId(videoUrl);

    useEffect(() => {
        if (!videoId || !containerRef.current) return;

        let isMounted = true;

        function createPlayer() {
            if (!isMounted) return;

            playerRef.current = new window.YT.Player(containerRef.current, {
                videoId,
                playerVars: {
                    controls: 1,
                },
                events: {
                    onReady: () => {
                        // Poll current time
                        intervalRef.current = setInterval(() => {
                            if (!playerRef.current || typeof onTimeUpdate !== "function")
                                return;
                            const t = playerRef.current.getCurrentTime();
                            if (!isNaN(t)) onTimeUpdate(t);
                        }, 200);
                    },
                },
            });
        }

        // Load YouTube IFrame API if needed
        if (!window.YT || !window.YT.Player) {
            const existingScript = document.getElementById("youtube-iframe-api");
            if (!existingScript) {
                const tag = document.createElement("script");
                tag.id = "youtube-iframe-api";
                tag.src = "https://www.youtube.com/iframe_api";
                document.body.appendChild(tag);
            }

            const prevCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prevCallback === "function") prevCallback();
                createPlayer();
            };
        } else {
            createPlayer();
        }

        return () => {
            isMounted = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (playerRef.current && playerRef.current.destroy) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
        };
    }, [videoId, onTimeUpdate]);

    if (!videoUrl) {
        return (
            <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                Paste a YouTube URL above
            </div>
        );
    }

    if (!videoId) {
        return (
            <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                Invalid YouTube URL
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            {/* YT will replace this div with an <iframe> */}
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
}
    