import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { AiService } from './ai.service';
import { SupabaseService } from '../supabase/supabase.service';

// Maps AI category slugs to Spanish names used in the default categories seed
const SLUG_TO_NAME: Record<string, string> = {
  salary: 'Salario',
  freelance: 'Freelance',
  investment: 'Inversiones',
  other_income: 'Otros ingresos',
  food: 'Alimentación',
  transport: 'Transporte',
  housing: 'Vivienda',
  services: 'Servicios',
  entertainment: 'Entretenimiento',
  health: 'Salud',
  education: 'Educación',
  other_expense: 'Otros gastos',
};

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

  private async resolveCategory(userId: string, slug: string, type: string): Promise<string | null> {
    const targetName = SLUG_TO_NAME[slug];
    const { data } = await this.supabase
      .getClient()
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${userId},is_default.eq.true`)
      .eq('type', type);

    if (!data?.length) return null;

    // Exact match first
    const exact = data.find((c) => c.name === targetName);
    if (exact) return exact.id;

    // Fallback: first category of that type
    return data[0]?.id ?? null;
  }

  @Post('parse-transaction')
  async parseTransaction(
    @Headers('authorization') auth: string,
    @Body() body: { text?: string; imageBase64?: string; mimeType?: string },
  ) {
    const userId = await this.getUserId(auth);
    const parsed = await this.aiService.parseTransaction(body.text, body.imageBase64, body.mimeType);

    // Resolve slug → real UUID
    const realCategoryId = await this.resolveCategory(userId, parsed.category_id, parsed.type);
    if (realCategoryId) parsed.category_id = realCategoryId;

    return parsed;
  }

  @Post('insights')
  async insights(
    @Headers('authorization') auth: string,
    @Body() body: { transactions: any[]; stats: any },
  ) {
    await this.getUserId(auth);
    return this.aiService.generateInsights(body.transactions, body.stats);
  }
}
