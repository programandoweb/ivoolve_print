import 'reflect-metadata'
import { NestFactory, HttpAdapterHost } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { apiLogger, correlationMiddleware, installProcessHooks, LoggingExceptionFilter } from './logging'

// Logs técnicos aislados (docs/logging/README.md). Se instala antes de crear la app.
installProcessHooks()

function version(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../package.json').version
  } catch {
    return undefined
  }
}

async function bootstrap() {
  apiLogger.info('app.started', 'API local de impresión iniciando', {
    metadata: { version: version(), node: process.version, pid: process.pid, node_env: process.env.NODE_ENV || 'development' },
  })

  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')

  app.use(correlationMiddleware)

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  )

  const { httpAdapter } = app.get(HttpAdapterHost)
  app.useGlobalFilters(new LoggingExceptionFilter(httpAdapter))

  const port = 3031
  apiLogger.info('config.loaded', 'Configuración de la API resuelta', {
    metadata: { port, log_level: apiLogger.config.level, log_retention_days: apiLogger.config.retentionDays },
  })

  try {
    await app.listen(port)
  } catch (error) {
    // Se registra y se relanza: el comportamiento (fallo de arranque) no cambia.
    apiLogger.fatal('api.listen_failed', `La API no pudo escuchar en el puerto ${port}`, { error, dedupe: true, metadata: { port } })
    apiLogger.flushSync()
    throw error
  }

  apiLogger.info('api.listening', `API NestJS escuchando en el puerto ${port}`, { metadata: { port } })
  console.log(`✅ API NestJS ejecutándose en http://localhost:${port}/api`)
}

bootstrap()
