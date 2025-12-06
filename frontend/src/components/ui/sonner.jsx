// src/components/ui/sonner.jsx
import React from "react";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      theme="dark"
      richColors
      closeButton
    />
  );
}
