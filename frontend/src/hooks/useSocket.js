import { useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SIGNAL_SERVER = import.meta.env.VITE_SIGNAL_SERVER || "http://localhost:3001";

let socketInstance = null;

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!socketInstance) {
      socketInstance = io(SIGNAL_SERVER, { transports: ["websocket"] });
    }
    socketRef.current = socketInstance;
    return () => {};
  }, []);

  const emit = useCallback((event, data) => {
    if (socketRef.current) socketRef.current.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    if (socketRef.current) socketRef.current.on(event, handler);
    return () => {
      if (socketRef.current) socketRef.current.off(event, handler);
    };
  }, []);

  const off = useCallback((event, handler) => {
    if (socketRef.current) socketRef.current.off(event, handler);
  }, []);

  return { emit, on, off, socket: socketRef };
}
