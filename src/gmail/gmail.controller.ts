import {
  Controller, Get, Post, Delete, Query, Req,
  Headers, UnauthorizedException, Res,
} from '@nestjs/common';
import { GmailService } from './gmail.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { Request, Response } from 'express';

@Controller('gmail')
export class GmailController {
  constructor(
    private readonly gmailService: GmailService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Get('auth')
  async startAuth(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    const url = this.gmailService.getAuthUrl(userId);
    return { url };
  }

  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`.replace(
      process.env.PORT || '3000',
      process.env.FRONTEND_PORT || '3001',
    );
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    if (error) return res.redirect(`${frontendUrl}/dashboard/sync?error=access_denied`);
    if (!code || !state) return res.redirect(`${frontendUrl}/dashboard/sync?error=missing_params`);

    try {
      const redirectUrl = await this.gmailService.handleCallback(code, state, frontendUrl);
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error('Gmail callback error:', err);
      return res.redirect(`${frontendUrl}/dashboard/sync?error=token_exchange`);
    }
  }

  @Get('status')
  async getStatus(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.gmailService.getStatus(userId);
  }

  @Delete('disconnect')
  async disconnect(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.gmailService.disconnect(userId);
  }

  @Post('sync')
  async sync(
    @Headers('authorization') auth: string,
    @Query('full') full?: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.gmailService.sync(userId, full === 'true');
  }

  @Post('reparse')
  async reparse(
    @Headers('authorization') auth: string,
    @Query('limit') limit?: string,
  ) {
    const userId = await this.getUserId(auth);
    return this.gmailService.reparse(userId, limit ? parseInt(limit) : 500);
  }

  @Get('synced-emails')
  async getSyncedEmails(@Headers('authorization') auth: string) {
    const userId = await this.getUserId(auth);
    return this.gmailService.getSyncedEmails(userId);
  }
}
