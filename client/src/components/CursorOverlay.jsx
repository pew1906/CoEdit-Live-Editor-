// src/components/CursorOverlay.jsx — Remote user cursors (Google Docs style)
//
// HOW CURSORS WORK:
// ─────────────────────────────────────────────────────────────────────────────
// 1. When a user moves their cursor or makes a selection in Quill, we emit
//    "cursor-update" to the server with { index, length } (the Quill range).
// 2. The server broadcasts it to all other clients in the same room.
// 3. Here, we use Quill's getBounds(index, length) API to convert the
//    character offset into pixel coordinates (top, left, height) in the editor.
// 4. We render a thin colored line + floating username label at those coords.
// 5. Coordinates are recalculated on every incoming update AND on window resize.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from "react";

export default function CursorOverlay({ quill, cursors, containerRef }) {
  // cursorPositions: { socketId → { top, left, height, username, color } }
  const [cursorPositions, setCursorPositions] = useState({});

  // Translate Quill character indices → pixel coordinates
  const recalculate = useCallback(() => {
    if (!quill || !containerRef?.current) return;

    const editorRect = containerRef.current.getBoundingClientRect();
    const quillRect = quill.root.getBoundingClientRect();

    const next = {};
    for (const [socketId, info] of Object.entries(cursors)) {
      if (!info.cursor || info.cursor.index == null) continue;
      try {
        const bounds = quill.getBounds(
          info.cursor.index,
          info.cursor.length || 0
        );
        next[socketId] = {
          // Position relative to the editor container
          top: bounds.top + (quillRect.top - editorRect.top),
          left: bounds.left + (quillRect.left - editorRect.left),
          height: bounds.height || 18,
          username: info.username,
          color: info.color,
        };
      } catch (_) {
        // Index out of range — skip
      }
    }
    setCursorPositions(next);
  }, [quill, cursors, containerRef]);

  // Recalculate whenever cursors change or window resizes
  useEffect(() => {
    recalculate();
    window.addEventListener("resize", recalculate);
    return () => window.removeEventListener("resize", recalculate);
  }, [recalculate]);

  if (!quill) return null;

  return (
    <div className="cursor-overlay" aria-hidden="true">
      {Object.entries(cursorPositions).map(([socketId, pos]) => (
        <div
          key={socketId}
          className="remote-cursor"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* The blinking caret line */}
          <div
            className="cursor-caret"
            style={{
              height: pos.height,
              background: pos.color,
            }}
          />
          {/* Username label above the caret */}
          <div
            className="cursor-label"
            style={{ background: pos.color }}
          >
            {pos.username}
          </div>
        </div>
      ))}
    </div>
  );
}
