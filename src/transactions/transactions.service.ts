import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly supabase: SupabaseService) {}

  private async attachCategories(userId: string, transactions: any[]) {
    if (!transactions.length) return transactions;
    const { data: cats } = await this.supabase
      .getClient()
      .from('categories')
      .select('id, name, icon, color')
      .or(`user_id.eq.${userId},is_default.eq.true`);
    const catMap: Record<string, any> = {};
    for (const c of cats || []) catMap[c.id] = c;
    return transactions.map((tx) => ({ ...tx, category: catMap[tx.category_id] ?? null }));
  }

  async findAll(userId: string, filters: Record<string, string | undefined> = {}) {
    const client = this.supabase.getClient();
    let query = client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.type) query = query.eq('type', filters.type);
    if (filters.category_id) query = query.eq('category_id', filters.category_id);
    if (filters.from) query = query.gte('date', filters.from);
    if (filters.to) query = query.lte('date', filters.to);
    if (filters.limit) query = query.limit(Number(filters.limit));

    const { data, error } = await query;
    if (error) throw error;
    return this.attachCategories(userId, data || []);
  }

  async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Transacción no encontrada');
    const [withCat] = await this.attachCategories(userId, [data]);
    return withCat;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .insert({ ...dto, user_id: userId, source: 'manual' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto) {
    await this.findOne(id, userId);

    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
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
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Transacción eliminada' };
  }

  async getStats(userId: string, from: string, to: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .select('type, amount')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to);

    if (error) throw error;

    const income = (data || [])
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expenses = (data || [])
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { income, expenses, balance: income - expenses };
  }

  async getCategoryExpenses(userId: string, from: string, to: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .select('category_id, amount')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('date', from)
      .lte('date', to);

    if (error) throw error;

    const map: Record<string, number> = {};
    for (const tx of data || []) {
      map[tx.category_id] = (map[tx.category_id] || 0) + Number(tx.amount);
    }
    return map;
  }

  async getMonthlyHistory(userId: string, months = 6, locale = 'es-CO') {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const from = startDate.toISOString().split('T')[0];

    const { data, error } = await this.supabase
      .getClient()
      .from('transactions')
      .select('type, amount, date')
      .eq('user_id', userId)
      .gte('date', from);

    if (error) throw error;

    const buckets: Record<string, { month: string; income: number; expenses: number }> = {};
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = {
        month: d.toLocaleDateString(locale, { month: 'short' }),
        income: 0,
        expenses: 0,
      };
    }

    for (const tx of data || []) {
      const key = (tx.date as string).substring(0, 7);
      if (buckets[key]) {
        if (tx.type === 'income') buckets[key].income += Number(tx.amount);
        else buckets[key].expenses += Number(tx.amount);
      }
    }

    return Object.values(buckets);
  }
}