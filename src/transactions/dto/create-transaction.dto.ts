import { IsNotEmpty, IsNumber, IsPositive, IsString, IsIn, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsIn(['income', 'expense'])
  type: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;
}