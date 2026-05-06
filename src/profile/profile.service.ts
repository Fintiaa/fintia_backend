import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProfileService {
  constructor(private readonly supabase: SupabaseService) {}

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Auto-downgrade if subscription_expires_at is in the past
    if (
      data?.subscription_tier === 'premium' &&
      data?.subscription_expires_at &&
      new Date(data.subscription_expires_at) < new Date()
    ) {
      await this.supabase
        .getClient()
        .from('profiles')
        .update({ subscription_tier: 'free', subscription_expires_at: null })
        .eq('id', userId);
      return { ...data, subscription_tier: 'free', subscription_expires_at: null };
    }

    return data;
  }

  async updateProfile(userId: string, updates: Record<string, unknown>) {
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
