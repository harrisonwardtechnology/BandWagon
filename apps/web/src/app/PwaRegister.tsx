"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).then(registration=>registration.update()).catch(() => {
        // Registration failure should not prevent the web app from loading.
      });
    }
  }, []);
  return null;
}
