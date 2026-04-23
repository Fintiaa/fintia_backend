import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { AiService } from './ai.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly supabase: SupabaseService,
  ) {}

  private async getUserId(authHeader: string): Promise<string> {
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Token requerido');
    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    return data.user.id;
  }

  @Post('parse-transaction')
  async parseTransaction(
    @Headers('authorization') auth: string,
    @Body() body: { text?: string; imageBase64?: string; mimeType?: string },
  ) {
    await this.getUserId(auth);
    return this.aiService.parseTransaction(body.text, body.imageBase64, body.mimeType);
  }
}
