import { IsNotEmpty, IsNumber, IsPositive, IsString, IsIn, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRecurringDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsIn(['income', 'expense'])
  type: string;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(31)
  @Type(() => Number)
  day_of_month: number;
}
