import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AlertsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(userId: string, unreadOnly = false, limit = 50) {
    let query = this.supabase
      .getClient()
      .from('alerts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getUnreadCount(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('alerts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { count: (data || []).length };
  }

  async markAsRead(id: string, userId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('alerts')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return { message: 'Alerta marcada como leída' };
  }

  async markAllAsRead(userId: string) {
    const { error } = await this.supabase
      .getClient()
      .from('alerts')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return { message: 'Todas las alertas marcadas como leídas' };
  }
}
