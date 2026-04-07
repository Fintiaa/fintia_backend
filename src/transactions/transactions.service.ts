import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly supabase: SupabaseService) {}

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

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
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
    return data;
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
}