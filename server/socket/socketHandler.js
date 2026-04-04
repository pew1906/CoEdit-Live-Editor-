// socket/socketHandler.js — All Socket.IO real-time event logic
//
// HOW CRDT (Yjs) WORKS HERE:
// ─────────────────────────────────────────────────────────────────────────────
// Yjs is a CRDT (Conflict-free Replicated Data Type) library.
// Instead of sending raw text deltas and hoping they apply cleanly, each
// client shares a *Yjs document* (Y.Doc) that encodes all edits as a
// sequence of "operations" that can be merged in ANY order without conflicts.
//
// Key concepts:
//  • Y.Doc         — shared document state (one per room/documentId)
//  • Y.Text        — the text type inside the Y.Doc (maps to Quill content)
//  • encodeStateAsUpdate() — serialises a Y.Doc to a binary Uint8Array
//  • applyUpdate()         — merges another client's update into our Y.Doc
//  • encodeStateVector()   — a compact fingerprint of what the doc has seen
//
// The server keeps one Y.Doc per documentId in memory.
// When a client connects:
//   1. Client sends its own stateVector.
//   2. Server replies with only the *diff* the client is missing.
//   3. Client applies the diff → both are now in sync.
// When a client edits:
//   1. Client emits `yjs-update` with an encoded binary update.
//   2. Server merges it into the Y.Doc and broadcasts to all other clients.
//   3. Every client applies the incoming update to their local Y.Doc.
// Because Yjs operations are commutative and idempotent, concurrent edits
// always converge to the same state — no data loss, no last-write-wins races.
// ─────────────────────────────────────────────────────────────────────────────

const Y = require("yjs");
const Document = require("../models/Document");

// In-memory store: documentId → { ydoc, users: Map<socketId, userInfo> }
const rooms = new Map();

// Assign a unique color to each user (cycles through a palette)
const USER_COLORS = [
  "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
  "#1abc9c", "#e67e22", "#e91e63", "#00bcd4", "#8bc34a",
];
let colorIdx = 0;
const nextColor = () => USER_COLORS[colorIdx++ % USER_COLORS.length];

/**
 * Get or create the Yjs document for a given documentId.
 * On first access, tries to seed the Yjs doc from the MongoDB content.
 */
const getOrCreateYDoc = async (documentId) => {
  if (rooms.has(documentId)) return rooms.get(documentId).ydoc;

  const ydoc = new Y.Doc();

  // Try to seed from persisted MongoDB content (Quill Delta → Yjs Text)
  try {
    const dbDoc = await Document.findOne({ documentId });
    if (dbDoc && dbDoc.content && dbDoc.content.ops) {
      const ytext = ydoc.getText("quill");
      ydoc.transact(() => {
        // Build text content from Delta ops (insert-only ops for plain seeding)
        let offset = 0;
        for (const op of dbDoc.content.ops) {
          if (typeof op.insert === "string") {
            ytext.insert(offset, op.insert, op.attributes || {});
            offset += op.insert.length;
          }
        }
      });
    }
  } catch (err) {
    console.warn("[ydoc-seed] Could not seed from DB:", err.message);
  }

  rooms.set(documentId, { ydoc, users: new Map() });
  return ydoc;
};

/**
 * Get all users in a room as a plain array (safe to JSON.stringify).
 */
const getRoomUsers = (documentId) => {
  if (!rooms.has(documentId)) return [];
  return Array.from(rooms.get(documentId).users.values());
};

/**
 * Debounced auto-save: waits 3 seconds after the last edit, then persists.
 * Stored per documentId to avoid multiple concurrent saves.
 */
const saveTimers = new Map();

const scheduleSave = (documentId, content) => {
  if (saveTimers.has(documentId)) clearTimeout(saveTimers.get(documentId));
  const timer = setTimeout(async () => {
    try {
      await Document.findOneAndUpdate(
        { documentId },
        {
          $set: { content },
          $push: {
            revisions: {
              $each: [{ content, savedBy: "auto-save", savedAt: new Date() }],
              $slice: -50,
            },
          },
        },
        { upsert: true }
      );
      console.log(`💾 Auto-saved document: ${documentId}`);
    } catch (err) {
      console.error("[auto-save]", err.message);
    }
    saveTimers.delete(documentId);
  }, 3000); // 3-second debounce
  saveTimers.set(documentId, timer);
};

/**
 * Main socket handler — attach all event listeners for a connected socket.
 */
const socketHandler = (io) => {
  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    let currentDocumentId = null;
    let currentUsername = null;

    // ── JOIN DOCUMENT ────────────────────────────────────────────────────────
    // Client sends { documentId, username } to join a collaborative session.
    socket.on("join-document", async ({ documentId, username }) => {
      // Leave previous room if re-joining
      if (currentDocumentId) {
        socket.leave(currentDocumentId);
        const room = rooms.get(currentDocumentId);
        if (room) room.users.delete(socket.id);
        io.to(currentDocumentId).emit("user-left", {
          socketId: socket.id,
          username: currentUsername,
          users: getRoomUsers(currentDocumentId),
        });
      }

      currentDocumentId = documentId;
      currentUsername = username || `Guest-${socket.id.slice(0, 4)}`;

      socket.join(documentId);

      // Ensure Yjs doc exists
      const ydoc = await getOrCreateYDoc(documentId);

      // Register user in the room
      const userInfo = {
        socketId: socket.id,
        username: currentUsername,
        color: nextColor(),
        cursor: null,
      };
      rooms.get(documentId).users.set(socket.id, userInfo);

      // Send the full Yjs state to the new client so it can sync
      const stateUpdate = Y.encodeStateAsUpdate(ydoc);
      socket.emit("yjs-sync", Buffer.from(stateUpdate).toString("base64"));

      // Also send current user list to the joining client
      socket.emit("users-init", getRoomUsers(documentId));

      // Tell everyone else that a new user joined
      socket.to(documentId).emit("user-joined", {
        ...userInfo,
        users: getRoomUsers(documentId),
      });

      console.log(`👤 ${currentUsername} joined document: ${documentId}`);
    });

    // ── YJS UPDATE (CRDT SYNC) ───────────────────────────────────────────────
    // Client sends a binary Yjs update (base64 encoded) whenever it edits.
    socket.on("yjs-update", ({ documentId, update, content }) => {
      const room = rooms.get(documentId);
      if (!room) return;

      // Apply the update to the server-side Yjs doc
      const updateBytes = Buffer.from(update, "base64");
      Y.applyUpdate(room.ydoc, updateBytes);

      // Broadcast the raw update to ALL other clients in the room
      // (they apply it independently — this is the CRDT broadcast)
      socket.to(documentId).emit("yjs-update", { update });

      // Schedule a debounced save of the Quill Delta (passed alongside)
      if (content) {
        scheduleSave(documentId, content);
      }
    });

    // ── CURSOR POSITION ──────────────────────────────────────────────────────
    // Client sends cursor position (index + length for selection range).
    socket.on("cursor-update", ({ documentId, cursor }) => {
      const room = rooms.get(documentId);
      if (!room) return;

      // Update stored cursor for this user
      const user = room.users.get(socket.id);
      if (user) {
        user.cursor = cursor;
        // Broadcast to others in the same room
        socket.to(documentId).emit("cursor-update", {
          socketId: socket.id,
          username: user.username,
          color: user.color,
          cursor,
        });
      }
    });

    // ── DOCUMENT NAME CHANGE ─────────────────────────────────────────────────
    socket.on("rename-document", async ({ documentId, name }) => {
      try {
        await Document.findOneAndUpdate({ documentId }, { $set: { name } });
        io.to(documentId).emit("document-renamed", { name });
      } catch (err) {
        console.error("[rename-document]", err.message);
      }
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${currentUsername})`);
      if (currentDocumentId) {
        const room = rooms.get(currentDocumentId);
        if (room) {
          room.users.delete(socket.id);
          io.to(currentDocumentId).emit("user-left", {
            socketId: socket.id,
            username: currentUsername,
            users: getRoomUsers(currentDocumentId),
          });

          // Clean up the room from memory if empty (saves RAM)
          if (room.users.size === 0) {
            rooms.delete(currentDocumentId);
            console.log(`🗑️  Room cleaned up: ${currentDocumentId}`);
          }
        }
      }
    });
  });
};

module.exports = socketHandler;
