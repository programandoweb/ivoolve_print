import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'

export class PrintInstructionDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string

  @IsOptional()
  @IsString()
  printerName?: string

  @IsString()
  @IsNotEmpty()
  type: string

  @IsObject()
  template: Record<string, any>

  @IsArray()
  dataset: Record<string, any>[]
}
