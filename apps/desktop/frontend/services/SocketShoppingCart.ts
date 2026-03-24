import { io, Socket } from "socket.io-client";

let cartSocket: Socket | null = null;

export const getCartSocket = () => cartSocket;

export const initCartSocket = () => {
  if (cartSocket) return cartSocket; // evita reconexiones

  cartSocket = io(
    process.env.NEXT_PUBLIC_SOCKET_SHOPPINGCART_URL || "http://localhost:4600",
    {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    }
  );

  return cartSocket;
};
