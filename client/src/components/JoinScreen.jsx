// src/components/JoinScreen.jsx — Username entry before joining a document
import React, { useState, useRef, useEffect } from "react";

export default function JoinScreen({ docId, onJoin }) {
  const [username, setUsername] = useState(
    () => localStorage.getItem("coedit-username") || ""
  );
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    // Persist so returning users don't re-type their name
    localStorage.setItem("coedit-username", name);
    onJoin(name);
  };

  return (
    <div className="join-screen">
      <div className="join-card">
        {/* Logo */}
        <div className="join-logo">
          <span className="logo-mark">Co</span>
          <span className="logo-mark accent">Edit</span>
        </div>

        <p className="join-subtitle">
          Real-time collaborative editing — powered by CRDT
        </p>

        <div className="join-doc-id">
          <span className="join-doc-label">Document</span>
          <span className="join-doc-value">{docId}</span>
        </div>

        <form onSubmit={handleSubmit} className="join-form">
          <label className="join-label" htmlFor="username">
            Your name
          </label>
          <input
            ref={inputRef}
            id="username"
            className="join-input"
            type="text"
            placeholder="e.g. Alex"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={24}
            autoComplete="off"
          />
          <button
            className="join-btn"
            type="submit"
            disabled={!username.trim()}
          >
            Join Document →
          </button>
        </form>

        <p className="join-hint">
          Share the URL with collaborators to edit together
        </p>
      </div>
    </div>
  );
}
