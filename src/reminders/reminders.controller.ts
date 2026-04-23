import { Controller, Post, Headers, UnauthorizedException } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly remindersService: RemindersService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUser(authHeader: string) {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user;
  }

  @Post('notify')
  async sendReminder(@Headers('authorization') auth: string) {
    const user = await this.getUser(auth);
    const name = (user.user_metadata?.full_name as string)?.split(' ')[0] || user.email!.split('@')[0];
    return this.remindersService.sendReminderEmail(user.email!, name);
  }
}
