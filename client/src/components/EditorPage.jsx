// src/components/EditorPage.jsx — Main editor page
//
// Orchestrates:
//   • JoinScreen  (shown before username is set)
//   • Quill editor (with Yjs CRDT binding)
//   • UserPresence sidebar
//   • CursorOverlay (remote cursors)
//   • RevisionHistory modal
//   • StatusBar
//
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import Quill from "quill";
// quill-cursors is registered as a Quill module for remote cursor rendering
import QuillCursors from "quill-cursors";

// Register the cursors module once at module load time (Quill v2 style)
Quill.register("modules/cursors", QuillCursors);

import { useSocket } from "../hooks/useSocket";
import { useYjs } from "../hooks/useYjs";

import JoinScreen from "./JoinScreen";
import UserPresence from "./UserPresence";
import CursorOverlay from "./CursorOverlay";
import RevisionHistory from "./RevisionHistory";
import StatusBar from "./StatusBar";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8001";

// Quill toolbar configuration
const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
  ["blockquote", "code-block"],
  ["link"],
  ["clean"],
];

// Quill v2 modules config — include cursors module
const QUILL_MODULES = {
  toolbar: TOOLBAR_OPTIONS,
  cursors: true, // enables quill-cursors for remote cursor display
};

export default function EditorPage() {
  const { docId } = useParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [username, setUsername] = useState(
    () => localStorage.getItem("coedit-username") || null
  );
  const [hasJoined, setHasJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({}); // socketId → { cursor, username, color }
  const [showHistory, setShowHistory] = useState(false);
  const [docName, setDocName] = useState("Untitled Document");
  const [lastSaved, setLastSaved] = useState(null);
  const [quill, setQuill] = useState(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const editorContainerRef = useRef(null); // wraps the editor + cursor overlay
  const quillContainerRef = useRef(null);  // the div Quill mounts into
  const quillRef = useRef(null);           // the Quill instance

  // ── Socket + Yjs ──────────────────────────────────────────────────────────
  const { socket, connected } = useSocket();
  // Find current user's color from the users list (assigned by server)
  const myColor = users.find((u) => u.username === username)?.color || "#00d4aa";
  useYjs({ quill, socket, documentId: docId, username, userColor: myColor, enabled: hasJoined });

  // ── Mount Quill ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!quillContainerRef.current || quillRef.current) return;

    const q = new Quill(quillContainerRef.current, {
      theme: "snow",
      modules: QUILL_MODULES,
      placeholder: "Start writing…",
    });

    quillRef.current = q;
    setQuill(q);
  }, []);

  // ── Join document ──────────────────────────────────────────────────────────
  const handleJoin = useCallback(
    (name) => {
      setUsername(name);
      setHasJoined(true);
      socket.emit("join-document", { documentId: docId, username: name });

      // Load document metadata from REST (for name + lastSaved)
      fetch(`${SERVER_URL}/api/documents/${docId}`)
        .then((r) => r.json())
        .then((doc) => {
          if (doc.name) setDocName(doc.name);
          if (doc.updatedAt) setLastSaved(doc.updatedAt);
        })
        .catch(() => {});
    },
    [socket, docId]
  );

  // Auto-join if username is already stored
  useEffect(() => {
    if (username && !hasJoined && socket?.connected) {
      handleJoin(username);
    }
  }, [username, hasJoined, socket, handleJoin]);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Initial user list when we first join
    const onUsersInit = (userList) => setUsers(userList);

    // Someone new joined
    const onUserJoined = ({ users: updatedUsers }) => setUsers(updatedUsers);

    // Someone left
    const onUserLeft = ({ users: updatedUsers, socketId }) => {
      setUsers(updatedUsers);
      // Remove their cursor
      setCursors((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    };

    // Remote cursor moved
    const onCursorUpdate = ({ socketId, username: uname, color, cursor }) => {
      setCursors((prev) => ({
        ...prev,
        [socketId]: { cursor, username: uname, color },
      }));
    };

    // Document was renamed by someone
    const onDocRenamed = ({ name }) => setDocName(name);

    socket.on("users-init", onUsersInit);
    socket.on("user-joined", onUserJoined);
    socket.on("user-left", onUserLeft);
    socket.on("cursor-update", onCursorUpdate);
    socket.on("document-renamed", onDocRenamed);

    return () => {
      socket.off("users-init", onUsersInit);
      socket.off("user-joined", onUserJoined);
      socket.off("user-left", onUserLeft);
      socket.off("cursor-update", onCursorUpdate);
      socket.off("document-renamed", onDocRenamed);
    };
  }, [socket]);

  // ── Broadcast our own cursor position ─────────────────────────────────────
  useEffect(() => {
    if (!quill || !socket || !hasJoined) return;

    const onSelectionChange = (range) => {
      if (!range) return;
      socket.emit("cursor-update", {
        documentId: docId,
        cursor: { index: range.index, length: range.length },
      });
    };

    quill.on("selection-change", onSelectionChange);
    return () => quill.off("selection-change", onSelectionChange);
  }, [quill, socket, hasJoined, docId]);

  // ── Track last-saved time (listen for auto-save acknowledgement) ──────────
  useEffect(() => {
    if (!socket) return;
    const onSaved = ({ updatedAt }) => setLastSaved(updatedAt);
    socket.on("document-saved", onSaved);
    return () => socket.off("document-saved", onSaved);
  }, [socket]);

  // ── Restore a revision ─────────────────────────────────────────────────────
  const handleRestore = useCallback(
    (content) => {
      if (!quill) return;
      quill.setContents(content);
    },
    [quill]
  );

  // ── Rename document ────────────────────────────────────────────────────────
  const handleRename = useCallback(() => {
    const newName = window.prompt("Rename document:", docName);
    if (!newName?.trim()) return;
    setDocName(newName.trim());
    socket.emit("rename-document", {
      documentId: docId,
      name: newName.trim(),
    });
  }, [socket, docId, docName]);

  // ── Show join screen if no username ───────────────────────────────────────
  if (!hasJoined) {
    return <JoinScreen docId={docId} onJoin={handleJoin} />;
  }

  // ── Main editor layout ─────────────────────────────────────────────────────
  return (
    <div className="app-layout">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="top-bar">
        <div className="top-bar-left">
          <div className="logo">
            <span className="logo-co">Co</span>
            <span className="logo-edit">Edit</span>
          </div>
          <button className="doc-name-btn" onClick={handleRename} title="Rename document">
            {docName}
            <span className="doc-name-edit-icon">✎</span>
          </button>
        </div>

        <div className="top-bar-right">
          {/* Compact user avatars */}
          <div className="top-bar-avatars">
            {users.slice(0, 5).map((u) => (
              <div
                key={u.socketId}
                className="avatar-chip"
                style={{ background: u.color }}
                title={u.username}
              >
                {u.username[0]?.toUpperCase()}
              </div>
            ))}
            {users.length > 5 && (
              <div className="avatar-chip avatar-chip--more">
                +{users.length - 5}
              </div>
            )}
          </div>

          <button
            className="toolbar-btn"
            onClick={() => setShowHistory(true)}
            title="Version history"
          >
            History
          </button>
        </div>
      </header>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="main-area">
        {/* Sidebar */}
        <aside className="sidebar">
          <UserPresence users={users} currentUser={username} />
        </aside>

        {/* Editor + cursors */}
        <div className="editor-area">
          <div className="editor-wrapper" ref={editorContainerRef}>
            {/* Cursor overlay sits on top of the editor */}
            <CursorOverlay
              quill={quill}
              cursors={cursors}
              containerRef={editorContainerRef}
            />
            {/* Quill mounts here */}
            <div ref={quillContainerRef} className="quill-mount" />
          </div>
        </div>
      </div>

      {/* ── Status bar ────────────────────────────────────────────────── */}
      <StatusBar connected={connected} lastSaved={lastSaved} docId={docId} />

      {/* ── Revision history modal ────────────────────────────────────── */}
      {showHistory && (
        <RevisionHistory
          docId={docId}
          onRestore={handleRestore}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
