  import { Module, Controller, Get } from '@nestjs/common'
  import { PrintController } from './print/print.controller'

  @Controller()
  class AppController {
    @Get('health')
    health() {
      return {
        ok: true,
        service: 'api',
        message: 'NestJS printer API running',
        timestamp: new Date().toISOString(),
      }
    }
  }

  @Module({
    controllers: [
      AppController,
      PrintController, // 👈 controlador de etiquetas
    ],
    providers: [],
  })
  export class AppModule {}