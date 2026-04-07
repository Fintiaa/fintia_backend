import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { AddSavingsDto } from './dto/add-savings.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async create(userId: string, dto: CreateGoalDto) {
    const { data, error } = await this.supabase
      .getClient()
      .from('goals')
      .insert({
        name: dto.name,
        target: Number(dto.target),
        saved: 0,
        deadline: dto.deadline || null,
        user_id: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async addSavings(id: string, userId: string, dto: AddSavingsDto) {
    const goal = await this.findOne(id, userId);

    const newSaved = Math.min(
      Number(goal.saved) + Number(dto.amount),
      Number(goal.target),
    );

    const { data, error } = await this.supabase
      .getClient()
      .from('goals')
      .update({ saved: newSaved })
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
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Meta eliminada' };
  }

  private async findOne(id: string, userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('goals')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Meta no encontrada');
    return data;
  }
}