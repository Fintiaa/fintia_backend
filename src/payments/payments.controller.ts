import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Post('create-checkout')
  async createCheckout(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return this.paymentsService.createCheckout(userId, frontendUrl);
  }

  @Post('webhook')
  async webhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }
}
