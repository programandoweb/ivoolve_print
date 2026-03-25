'use client'

import React, { createContext, useContext, useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'
import useUserHook from '@/hooks/useUserHook'

type SocketContextType = {
  socket: Socket | null
  emitPrint: (payload: any) => void
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  emitPrint: () => {},
})

export const useSocketPrint = (): SocketContextType => useContext(SocketContext)

export default function SocketProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = useUserHook()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!user?.token || !process.env.NEXT_PUBLIC_SOCKET_URL_PRINT) return

    const socket = io(`${process.env.NEXT_PUBLIC_SOCKET_URL_PRINT}/printer`, {
      transports: ['websocket'],
      auth: {
        token: user.token,
      },
    })

    socketRef.current = socket

    const handleConnect = () => {
      console.log('Socket conectado:', socket.id)
    }

    const handleConnectError = (error: Error) => {
      console.error('Error de conexión socket:', error.message)
    }

    const handlePrinterConnected = (data: unknown) => {
      console.log('printer:connected =>', data)
    }

    const handlePrinterAck = (data: unknown) => {
      console.log('printer:ack =>', data)
    }

    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('printer:connected', handlePrinterConnected)
    socket.on('printer:ack', handlePrinterAck)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('connect_error', handleConnectError)
      socket.off('printer:connected', handlePrinterConnected)
      socket.off('printer:ack', handlePrinterAck)
      socket.disconnect()
      socketRef.current = null
    }
  }, [user?.token])

  const emitPrint = (payload: any) => {
    socketRef.current?.emit('printer:listen', payload)
  }

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        emitPrint,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}