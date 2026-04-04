// src/components/StatusBar.jsx — Bottom status bar
import React from "react";

export default function StatusBar({ connected, lastSaved, docId }) {
  const formatSaved = (iso) => {
    if (!iso) return "Not saved yet";
    const d = new Date(iso);
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 10) return "Saved just now";
    if (diffSec < 60) return `Saved ${diffSec}s ago`;
    if (diffSec < 3600) return `Saved ${Math.floor(diffSec / 60)}m ago`;
    return `Saved at ${d.toLocaleTimeString()}`;
  };

  // Copy current URL to clipboard
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  return (
    <div className="status-bar">
      {/* Left: connection status */}
      <div className="status-left">
        <span className={`status-indicator ${connected ? "status-connected" : "status-disconnected"}`}>
          <span className="status-dot-small" />
          {connected ? "Connected" : "Reconnecting…"}
        </span>
      </div>

      {/* Center: doc ID */}
      <div className="status-center">
        <span className="status-docid">doc / {docId}</span>
      </div>

      {/* Right: save state + share */}
      <div className="status-right">
        <span className="status-save">{formatSaved(lastSaved)}</span>
        <button className="status-share-btn" onClick={copyLink} title="Copy link">
          Share ⟳
        </button>
      </div>
    </div>
  );
}
