// src/components/ui/toaster.jsx
import React from "react";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      theme="dark"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "9999px",
          background: "rgba(15,23,42,0.95)",
          border: "1px solid rgba(148,163,184,0.4)",
          backdropFilter: "blur(16px)",
        },
      }}
    />
  );
}
