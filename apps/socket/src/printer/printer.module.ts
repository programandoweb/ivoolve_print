import { Module } from '@nestjs/common'
import { PrinterGateway } from './printer.gateway'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [PrinterGateway],
})
export class PrinterModule {}