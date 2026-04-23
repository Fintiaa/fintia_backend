import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
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
  async findAll(
    @Headers('authorization') auth: string,
    @Query('unread_only') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.alertsService.findAll(userId, unreadOnly === 'true', limit ? Number(limit) : 50);
  }

  @Get('unread-count')
  async getUnreadCount(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.alertsService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  async markAsRead(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.alertsService.markAsRead(id, userId);
  }

  @Patch('read-all')
  async markAllAsRead(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.alertsService.markAllAsRead(userId);
  }
}
