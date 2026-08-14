"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // App shell cache is a nice-to-have; never block the app on it.
      });
    }
  }, []);

  return null;
}
