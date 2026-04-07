import { IsNumber, IsPositive, IsUUID, IsIn, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBudgetDto {
  @IsUUID()
  category_id: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsIn(['monthly', 'weekly'])
  period: string;

  @IsDateString()
  start_date: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}