import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Get()
  async findAll(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.budgetsService.findAll(userId);
  }

  @Get('with-spending')
  async findAllWithSpending(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.budgetsService.findAllWithSpending(userId);
  }

  @Post()
  async create(
    @Headers('authorization') auth: string,
    @Body() dto: CreateBudgetDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.budgetsService.create(userId, dto);
  }

  @Put(':id')
  async update(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.budgetsService.update(id, userId, dto);
  }

  @Delete(':id')
  async remove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.budgetsService.remove(id, userId);
  }
}