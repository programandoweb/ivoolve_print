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
import { PrintInstructionDto } from './dto/print-instruction.dto'
import { WsJwtGuard } from '../auth/ws-jwt.guard'

@WebSocketGateway({
  namespace: '/printer',
  cors: {
    origin: '*',
  },
})
export class PrinterGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  handleConnection(client: Socket) {
    //console.log(client)

    console.log(`Cliente conectado 2026: ${client.id}`)

    client.emit('printer:connected', {
      ok: true,
      message: 'Conectado al socket de impresión',
      socketId: client.id,
    })
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`)
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('printer:listen')
  handlePrinterInstruction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    console.log('Usuario autenticado:', client.user)
    console.log('Instrucción de impresión recibida:', payload)

    client.emit('printer:ack', {
      ok: true,
      message: 'Instrucción recibida correctamente',
      receivedAt: new Date().toISOString(),
      payload,
      user: client.user,
    })

    return {
      ok: true,
      event: 'printer:listen',
      message: 'Evento procesado',
      data: payload,
      user: client.user,
    }
  }
}