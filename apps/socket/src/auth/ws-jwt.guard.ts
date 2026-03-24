import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient()
    const token =
      client.handshake?.auth?.token ||
      this.extractFromHeader(client.handshake?.headers?.authorization)

    if (!token) {
      throw new UnauthorizedException('Token no enviado')
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'super_secret_key_change_me',
      })

      client.user = payload
      return true
    } catch {
      throw new UnauthorizedException('Token inválido')
    }
  }

  private extractFromHeader(authorization?: string): string | null {
    console.log("autorización")
    if (!authorization) return null
    console.log("autorizado")
    const [type, token] = authorization.split(' ')
    if (type !== 'Bearer' || !token) return null

    return token
  }
}