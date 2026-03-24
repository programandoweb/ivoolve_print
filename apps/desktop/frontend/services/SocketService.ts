// services/SocketService.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => socket;

export const initSocket = (userId: number) => {
  if (socket) return socket; // evita reconexiones

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4500", {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  return socket;
};
