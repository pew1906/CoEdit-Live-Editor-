// src/hooks/useSocket.js — Socket.IO connection hook
//
// Manages a single socket connection for the app lifetime.
// Provides the socket instance and a "connected" boolean.

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:8001";

// Module-level singleton so the socket isn't recreated on every render
let socketInstance = null;

export const useSocket = () => {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Create socket once
    if (!socketInstance) {
      socketInstance = io(SERVER_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
      });
    }

    const socket = socketInstance;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Sync initial state
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return { socket: socketInstance, connected };
};
