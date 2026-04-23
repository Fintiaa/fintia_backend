import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateRecurringDto } from './dto/create-recurring.dto';
import { UpdateRecurringDto } from './dto/update-recurring.dto';

@Injectable()
export class RecurringService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async create(userId: string, dto: CreateRecurringDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_transactions')
      .insert({ ...dto, user_id: userId, is_active: true })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, dto: UpdateRecurringDto) {
    await this.findOne(id, userId);

    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_transactions')
      .update(dto)
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
      .from('recurring_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Transacción recurrente eliminada' };
  }

  private async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('recurring_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Transacción recurrente no encontrada');
    return data;
  }
}
