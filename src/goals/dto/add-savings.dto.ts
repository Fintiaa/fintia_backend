import { IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class AddSavingsDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;
}