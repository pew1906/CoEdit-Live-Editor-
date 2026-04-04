import * as Y from 'yjs';
import debounce from 'lodash.debounce';
import { Document } from '../models/Document.js';
import { Revision } from '../models/Revision.js';

const SAVE_DEBOUNCE_MS = parseInt(process.env.SAVE_DEBOUNCE_MS || '2000', 10);
const REVISION_DEBOUNCE_MS = parseInt(process.env.REVISION_DEBOUNCE_MS || '10000', 10);
const MAX_REVISIONS_PER_DOC = 50;

// Palette of distinct user colors
const USER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
  '#00bcd4', '#ff5722',
];

// In-memory Yjs document store: Map<docId, Y.Doc>
const ydocs = new Map();

// Active users per document: Map<docId, Map<socketId, {username, color}>>
const rooms = new Map();

// Per-document debounced functions
const saveQueues = new Map();
const revisionQueues = new Map();

// ── Yjs helpers ─────────────────────────────────────────────────────────────

function getYDoc(docId) {
  if (!ydocs.has(docId)) {
    ydocs.set(docId, new Y.Doc());
  }
  return ydocs.get(docId);
}

// ── Room helpers ─────────────────────────────────────────────────────────────

function getRoomUsers(docId) {
  if (!rooms.has(docId)) rooms.set(docId, new Map());
  return rooms.get(docId);
}

function assignColor(docId) {
  const users = getRoomUsers(docId);
  const usedColors = new Set([...users.values()].map((u) => u.color));
  return USER_COLORS.find((c) => !usedColors.has(c)) ?? USER_COLORS[0];
}

function broadcastUsers(io, docId) {
  const users = getRoomUsers(docId);
  const list = [...users.entries()].map(([socketId, u]) => ({ socketId, ...u }));
  io.to(docId).emit('users-update', list);
}

// ── Persistence ───────────────────────────────────────────────────────────────

function getDebouncedSave(docId) {
  if (!saveQueues.has(docId)) {
    saveQueues.set(
      docId,
      debounce(async (id, ydoc) => {
        try {
          const state = Y.encodeStateAsUpdate(ydoc);
          await Document.findByIdAndUpdate(
            id,
            { yjsState: Buffer.from(state) },
            { upsert: true, new: true }
          );
        } catch (err) {
          console.error(`[DB] Failed to save document ${id}:`, err.message);
        }
      }, SAVE_DEBOUNCE_MS)
    );
  }
  return saveQueues.get(docId);
}

function getDebouncedRevision(docId) {
  if (!revisionQueues.has(docId)) {
    revisionQueues.set(
      docId,
      debounce(async (id, ydoc) => {
        try {
          const ytext = ydoc.getText('quill');
          const content = { ops: [{ insert: ytext.toString() || '\n' }] };
          await Revision.create({ documentId: id, content });

          // Prune old revisions beyond max
          const revisions = await Revision.find({ documentId: id })
            .sort({ savedAt: -1 })
            .skip(MAX_REVISIONS_PER_DOC)
            .select('_id');
          if (revisions.length > 0) {
            const ids = revisions.map((r) => r._id);
            await Revision.deleteMany({ _id: { $in: ids } });
          }
        } catch (err) {
          console.error(`[DB] Failed to save revision for ${id}:`, err.message);
        }
      }, REVISION_DEBOUNCE_MS)
    );
  }
  return revisionQueues.get(docId);
}

// ── Socket handler registration ───────────────────────────────────────────────

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    let currentDocId = null;
    let currentUser = null;

    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── JOIN DOCUMENT ──────────────────────────────────────────────
    socket.on('join-document', async ({ docId, username }) => {
      if (!docId || !username) {
        socket.emit('error', { message: 'docId and username are required' });
        return;
      }

      currentDocId = docId;
      socket.join(docId);

      // Assign presence
      const color = assignColor(docId);
      currentUser = { username, color };
      getRoomUsers(docId).set(socket.id, currentUser);

      // Load Yjs state from DB
      try {
        const ydoc = getYDoc(docId);
        let dbDoc = await Document.findById(docId);
        if (!dbDoc) {
          dbDoc = await Document.create({ _id: docId });
        }
        if (dbDoc.yjsState && dbDoc.yjsState.length > 0) {
          Y.applyUpdate(ydoc, new Uint8Array(dbDoc.yjsState));
        }

        // Send full state to joining client
        const state = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs-init', { update: Array.from(state) });
      } catch (err) {
        console.error(`[Socket] Failed to load doc ${docId}:`, err.message);
        socket.emit('error', { message: 'Failed to load document' });
      }

      broadcastUsers(io, docId);
      console.log(`[Socket] ${username} (${socket.id}) joined doc:${docId}`);
    });

    // ── YJS UPDATE ─────────────────────────────────────────────────
    socket.on('yjs-update', ({ docId, update }) => {
      if (!docId || !update) return;

      try {
        const ydoc = getYDoc(docId);
        const uint8 = new Uint8Array(update);
        // Apply locally (authoritative merge)
        Y.applyUpdate(ydoc, uint8);
        // Relay to all other clients in the room
        socket.to(docId).emit('yjs-update', { update });
        // Persist (debounced)
        getDebouncedSave(docId)(docId, ydoc);
        getDebouncedRevision(docId)(docId, ydoc);
      } catch (err) {
        console.error(`[Socket] Failed to apply yjs-update for doc ${docId}:`, err.message);
      }
    });

    // ── CURSOR UPDATE ───────────────────────────────────────────────
    socket.on('cursor-update', ({ docId, range }) => {
      if (!docId || !currentUser) return;
      socket.to(docId).emit('cursor-update', {
        socketId: socket.id,
        username: currentUser.username,
        color: currentUser.color,
        range,
      });
    });

    // ── GET REVISIONS ───────────────────────────────────────────────
    socket.on('get-revisions', async ({ docId }) => {
      if (!docId) return;
      try {
        const revisions = await Revision.find({ documentId: docId })
          .sort({ savedAt: -1 })
          .limit(MAX_REVISIONS_PER_DOC)
          .lean();
        socket.emit('revisions-list', revisions);
      } catch (err) {
        console.error(`[Socket] Failed to get revisions for ${docId}:`, err.message);
        socket.emit('revisions-list', []);
      }
    });

    // ── DISCONNECT ──────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
      if (currentDocId && currentUser) {
        getRoomUsers(currentDocId).delete(socket.id);
        socket.to(currentDocId).emit('cursor-remove', { socketId: socket.id });
        broadcastUsers(io, currentDocId);
      }
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error on ${socket.id}:`, err);
    });
  });
}
