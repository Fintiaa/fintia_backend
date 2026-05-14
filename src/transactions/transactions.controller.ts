import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase
      .getClient()
      .auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Get()
  async findAll(
    @Headers('authorization') auth: string,
    @Query('type') type?: string,
    @Query('category_id') category_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.findAll(userId, { type, category_id, from, to });
  }

  @Get('stats')
  async getStats(
    @Headers('authorization') auth: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.getStats(userId, from, to);
  }

  @Get('category-expenses')
  async getCategoryExpenses(
    @Headers('authorization') auth: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.getCategoryExpenses(userId, from, to);
  }

  @Get('dashboard-summary')
  async getDashboardSummary(
    @Headers('authorization') auth: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('months') months?: string,
    @Query('locale') locale?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = await this.getUserId(auth);
    const [stats, categoryExpenses, history, recent] = await Promise.all([
      this.transactionsService.getStats(userId, from, to),
      this.transactionsService.getCategoryExpenses(userId, from, to),
      this.transactionsService.getMonthlyHistory(userId, months ? Number(months) : 6, locale || 'es-CO'),
      this.transactionsService.findAll(userId, { limit: limit || '5' }),
    ]);
    return { stats, categoryExpenses, history, recent };
  }

  @Get('monthly-history')
  async getMonthlyHistory(
    @Headers('authorization') auth: string,
    @Query('months') months?: string,
    @Query('locale') locale?: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.getMonthlyHistory(userId, months ? Number(months) : 6, locale || 'es-CO');
  }

  @Get(':id')
  async findOne(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.findOne(id, userId);
  }

  @Post()
  async create(
    @Headers('authorization') auth: string,
    @Body() dto: CreateTransactionDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.create(userId, dto);
  }

  @Put(':id')
  async update(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.update(id, userId, dto);
  }

  @Delete(':id')
  async remove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.transactionsService.remove(id, userId);
  }
}