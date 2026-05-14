import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async findAllWithSpending(userId: string) {
    const budgets = await this.findAll(userId);
    const now = new Date();

    const withSpending = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await this.getSpending(userId, budget.category_id, budget.period, now);
        const percentage = budget.amount > 0 ? (spent / Number(budget.amount)) * 100 : 0;
        return {
          ...budget,
          spent,
          percentage: Math.round(percentage * 100) / 100,
        };
      }),
    );

    return this.attachCategories(userId, withSpending);
  }

  private async attachCategories(userId: string, budgets: any[]) {
    if (budgets.length === 0) return budgets;

    const categoryIds = [...new Set(budgets.map((b) => b.category_id).filter(Boolean))];
    const { data } = await this.supabase
      .getClient()
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .in('id', categoryIds);

    const catMap: Record<string, any> = {};
    for (const c of data || []) catMap[c.id] = c;

    return budgets.map((b) => ({ ...b, category: catMap[b.category_id] ?? null }));
  }

  private async getSpending(userId: string, categoryId: string, period: string, now: Date) {
    let from: string;
    let to: string;

    if (period === 'monthly') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      from = startOfWeek.toISOString().split('T')[0];
      to = endOfWeek.toISOString().split('T')[0];
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .eq('type', 'expense')
      .gte('date', from)
      .lte('date', to);

    if (error) throw error;
    return (data || []).reduce((sum, t) => sum + Number(t.amount), 0);
  }

  async create(userId: string, dto: CreateBudgetDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('budgets')
      .insert({ ...dto, user_id: userId, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, dto: UpdateBudgetDto) {
    await this.findOne(id, userId);

    const { data, error } = await this.supabase
      .getClient()
      .from('budgets')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    const { error } = await this.supabase
      .getClient()
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Presupuesto eliminado' };
  }

  private async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('budgets')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Presupuesto no encontrado');
    return data;
  }
}