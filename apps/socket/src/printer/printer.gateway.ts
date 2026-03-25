import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { Server, Socket } from 'socket.io'
import { WsJwtGuard } from '../auth/ws-jwt.guard'

type ConnectedClient = {
  socketId: string
  sessionId: string
  userId?: string | number
  userName?: string
  role?: string
  token?: string
  connectedAt: string
  auth?: Record<string, any>
  user?: any
}

type PrintInstructionPayload = {
  targetSessionId: string
  deviceId: string
  printerName: string
  type: string
  template: {
    name: string
    size: string
  }
  dataset: any[]
  batch_code?: string | number
  abbreviation?: string
}

@WebSocketGateway({
  namespace: '/printer',
  cors: {
    origin: '*',
  },
})
export class PrinterGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private connectedClients = new Map<string, ConnectedClient>()

  handleConnection(client: Socket) {
    const auth = client.handshake?.auth || {}

    const sessionData: ConnectedClient = {
      socketId: client.id,
      sessionId: client.id,
      userId: auth.userId,
      userName: auth.userName,
      role: auth.role,
      token: auth.token,
      connectedAt: new Date().toISOString(),
      auth,
    }

    this.connectedClients.set(client.id, sessionData)

    console.log('Cliente conectado 2026:', sessionData)

    client.emit('printer:connected', {
      ok: true,
      message: 'Conectado al socket de impresión',
      socketId: client.id,
      session: sessionData,
    })
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id)
    console.log(`Cliente desconectado: ${client.id}`)
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('printer:get-connected-clients')
  handleGetConnectedClients(
    @ConnectedSocket() client: Socket,
    @MessageBody() body?: { role?: string },
  ) {
    const roleFilter = body?.role?.trim()

    let clients = Array.from(this.connectedClients.values())

    if (roleFilter) {
      clients = clients.filter((item) => item.role === roleFilter)
    }

    return {
      ok: true,
      requestedBy: client.id,
      total: clients.length,
      roleFilter: roleFilter || null,
      clients: clients.map((item) => ({
        socketId: item.socketId,
        sessionId: item.sessionId,
        userId: item.userId,
        userName: item.userName,
        role: item.role,
        connectedAt: item.connectedAt,
      })),
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('printer:listen')
  handlePrinterInstruction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PrintInstructionPayload,
  ) {
    const currentSession = this.connectedClients.get(client.id)

    if (currentSession) {
      currentSession.user = client.user
      this.connectedClients.set(client.id, currentSession)
    }

    const targetClient = this.connectedClients.get(payload.targetSessionId)

    if (!targetClient) {
      client.emit('printer:ack', {
        ok: false,
        message: 'La impresora seleccionada ya no está conectada',
        targetSessionId: payload.targetSessionId,
      })

      return {
        ok: false,
        message: 'La impresora seleccionada ya no está conectada',
      }
    }

    this.server.to(payload.targetSessionId).emit('printer:job', {
      ok: true,
      message: 'Nueva orden de impresión',
      requestedAt: new Date().toISOString(),
      requestedBy: {
        socketId: client.id,
        user: client.user,
      },
      target: {
        sessionId: targetClient.sessionId,
        userName: targetClient.userName,
        role: targetClient.role,
      },
      payload,
    })

    client.emit('printer:ack', {
      ok: true,
      message: 'Orden enviada a la impresora seleccionada',
      targetSessionId: targetClient.sessionId,
      targetUserName: targetClient.userName,
      receivedAt: new Date().toISOString(),
    })

    return {
      ok: true,
      message: 'Evento procesado',
      targetSessionId: targetClient.sessionId,
      targetUserName: targetClient.userName,
    }
  }
}