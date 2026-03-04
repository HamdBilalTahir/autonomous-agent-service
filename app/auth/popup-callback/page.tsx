"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function PopupCallback() {
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        { type: "GITHUB_AUTH_SUCCESS" },
        window.location.origin,
      );
      window.close();
    } else {
      // Not opened as a popup — redirect home
      window.location.href = "/";
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Connecting GitHub account...
      </div>
    </div>
  );
}
