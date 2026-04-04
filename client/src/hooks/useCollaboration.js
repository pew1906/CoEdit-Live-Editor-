import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { QuillBinding } from 'y-quill';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8001';

/**
 * useCollaboration
 * Wires a Quill instance to a shared Yjs doc via Socket.IO.
 *
 * Returns:
 *  - users        : active user list
 *  - revisions    : fetched revisions
 *  - fetchRevisions : fn to request revision list
 *  - connected    : socket connected state
 *  - loading      : true until first yjs-init received
 *  - onSocket     : stable fn to register socket listeners safely
 */
export function useCollaboration({ quillRef, docId, username }) {
  const socketRef = useRef(null);
  const listenersRef = useRef([]);   // callbacks waiting for socket

  const [users, setUsers] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quillRef.current || !docId || !username) return;

    const quill = quillRef.current;
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('quill');
    const binding = new QuillBinding(ytext, quill);

    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    // Notify all onSocket subscribers
    const cleanups = listenersRef.current.map((cb) => cb(socket)).filter(Boolean);

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-document', { docId, username });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    socket.on('yjs-init', ({ update }) => {
      Y.applyUpdate(ydoc, new Uint8Array(update));
      setLoading(false);
    });

    socket.on('yjs-update', ({ update }) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), socket);
    });

    const handleYjsUpdate = (update, origin) => {
      if (origin === socket) return;
      socket.emit('yjs-update', { docId, update: Array.from(update) });
    };
    ydoc.on('update', handleYjsUpdate);

    socket.on('users-update', setUsers);
    socket.on('revisions-list', setRevisions);

    const handleSelectionChange = (range) => {
      socket.emit('cursor-update', { docId, range });
    };
    quill.on('selection-change', handleSelectionChange);

    // Fallback: if server never sends yjs-init (empty doc), stop loading after timeout
    const loadingTimeout = setTimeout(() => setLoading(false), 4000);

    return () => {
      clearTimeout(loadingTimeout);
      cleanups.forEach((fn) => fn?.());
      ydoc.off('update', handleYjsUpdate);
      quill.off('selection-change', handleSelectionChange);
      binding.destroy();
      ydoc.destroy();
      socket.disconnect();
      socketRef.current = null;
      setUsers([]);
      setConnected(false);
      setLoading(true);
    };
  }, [docId, username]);

  /**
   * onSocket(callback)
   * Safely registers socket event listeners. If the socket is already live,
   * fires immediately. Otherwise queues until socket connects.
   * The callback receives the socket and should return a cleanup fn.
   * Returns a cleanup function to deregister.
   */
  const onSocket = useCallback((callback) => {
    if (socketRef.current) {
      const cleanup = callback(socketRef.current);
      return cleanup ?? (() => {});
    }
    // Queue for when socket connects
    listenersRef.current.push(callback);
    return () => {
      listenersRef.current = listenersRef.current.filter((cb) => cb !== callback);
    };
  }, []);

  const fetchRevisions = useCallback(() => {
    socketRef.current?.emit('get-revisions', { docId });
  }, [docId]);

  return { users, revisions, fetchRevisions, connected, loading, onSocket };
}
