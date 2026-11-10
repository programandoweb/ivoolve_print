import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { apiLogger } from './logger'

// Registra las excepciones de solicitudes y delega SIEMPRE en el filtro por defecto de Nest,
// de modo que la respuesta al cliente no cambia. Nunca registra cuerpos, query ni headers.
@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    try {
      if (host.getType() === 'http') {
        const req: any = host.switchToHttp().getRequest()
        const status = exception instanceof HttpException ? exception.getStatus() : 500
        // Plantilla de la ruta (no la URL real): evita datos del cliente y claves ilimitadas.
        const route = req?.route?.path || 'unmatched'
        const metadata = { method: req?.method, route, http_status: status }
        const options = {
          correlation_id: req?.correlationId,
          duration_ms: req?.startedAt ? Date.now() - req.startedAt : undefined,
          error: exception,
          metadata,
        }
        if (status >= 500) apiLogger.error('api.request_failed', 'La solicitud a la API local terminó con error', options)
        else if (status === 401 || status === 403) apiLogger.sampler.fail(`auth:${route}`, 'warn', 'security.auth_rejected', `Solicitud rechazada (HTTP ${status})`, options)
        else apiLogger.sampler.fail(`http:${status}:${route}`, 'warn', 'api.request_failed', `Solicitud rechazada (HTTP ${status})`, options)
      }
    } catch { /* el registro jamás altera la respuesta */ }
    super.catch(exception, host)
  }
}
