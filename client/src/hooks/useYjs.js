// src/hooks/useYjs.js — Yjs CRDT integration with Quill v2
//
// HOW THIS WORKS:
// ─────────────────────────────────────────────────────────────────────────────
// 1. We create a Y.Doc (the shared CRDT document) on the client.
// 2. We bind it to the Quill editor via QuillBinding (from y-quill 1.0.0).
//    QuillBinding keeps Quill's content in sync with the Y.Text "quill" type.
// 3. When the server sends "yjs-sync" (on join), we decode the base64 state
//    and call Y.applyUpdate() — this brings us up to date with all past edits.
// 4. When the server sends "yjs-update" (another user typed), we call
//    Y.applyUpdate() again — Yjs merges it without conflicts.
// 5. When we edit locally, Y.Doc fires an "update" event.
//    We encode it as base64 and emit "yjs-update" to the server.
//    The server rebroadcasts to everyone else.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { QuillBinding } from "y-quill";

export const useYjs = ({ quill, socket, documentId, username, userColor, enabled }) => {
  const ydocRef = useRef(null);
  const bindingRef = useRef(null);

  useEffect(() => {
    if (!quill || !socket || !documentId || !enabled) return;

    // Create a new Y.Doc for this document session
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Get the shared text type (must match server-side key: "quill")
    const ytext = ydoc.getText("quill");

    // Bind Yjs text to the Quill editor (no awareness — we handle cursors
    // manually via Socket.IO events in CursorOverlay)
    const binding = new QuillBinding(ytext, quill);
    bindingRef.current = binding;

    // ── Handle initial full-state sync from server ───────────────────────────
    // When we join, the server sends the complete Y.Doc state as base64.
    const handleSync = (base64State) => {
      try {
        const bytes = Uint8Array.from(atob(base64State), (c) => c.charCodeAt(0));
        Y.applyUpdate(ydoc, bytes);
      } catch (err) {
        console.error("[yjs-sync] Failed to apply state:", err);
      }
    };

    // ── Handle incremental updates from other users ──────────────────────────
    const handleUpdate = ({ update }) => {
      try {
        const bytes = Uint8Array.from(atob(update), (c) => c.charCodeAt(0));
        Y.applyUpdate(ydoc, bytes);
      } catch (err) {
        console.error("[yjs-update] Failed to apply update:", err);
      }
    };

    // ── Broadcast our own local edits ────────────────────────────────────────
    const handleLocalUpdate = (update, origin) => {
      // Skip updates that originated from the network to avoid echo loop
      if (origin === binding) return;

      const base64 = btoa(String.fromCharCode(...update));
      socket.emit("yjs-update", {
        documentId,
        update: base64,
        content: quill.getContents(),
      });
    };

    ydoc.on("update", handleLocalUpdate);
    socket.on("yjs-sync", handleSync);
    socket.on("yjs-update", handleUpdate);

    return () => {
      ydoc.off("update", handleLocalUpdate);
      socket.off("yjs-sync", handleSync);
      socket.off("yjs-update", handleUpdate);
      binding.destroy();
      ydoc.destroy();
      ydocRef.current = null;
      bindingRef.current = null;
    };
  }, [quill, socket, documentId, enabled]);

  return { ydoc: ydocRef.current };
};
