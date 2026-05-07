import { Controller, Post, Body, Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';

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

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly ai: AiService,
    private readonly supabase: SupabaseService,
  ) {}

  @Post('webhook')
  async webhook(@Body() body: Record<string, string>) {
    const from = body.From?.replace('whatsapp:', '');
    const text = body.Body?.trim();
    const mediaUrl = body.MediaUrl0;
    const mediaType = body.MediaContentType0;

    if (!from) return { status: 'ignored' };

    this.logger.log(`WhatsApp de ${from}: "${text}"`);

    // Lookup user by whatsapp_number
    const { data: profiles } = await this.supabase
      .getClient()
      .from('profiles')
      .select('id, full_name')
      .eq('whatsapp_number', from)
      .limit(1);

    if (!profiles?.length) {
      await this.whatsapp.sendMessage(
        from,
        '¡Hola! 👋 No encontré tu número en Fintia. Regístralo en *Configuración → Número de WhatsApp* dentro de la app.',
      );
      return { status: 'unregistered' };
    }

    const userId = profiles[0].id;
    const firstName = profiles[0].full_name?.split(' ')[0] || 'amigo';

    // Help command
    if (/^(ayuda|help|hola|inicio|menu|menú|\?)$/i.test(text || '')) {
      await this.whatsapp.sendMessage(
        from,
        `¡Hola ${firstName}! 👋 Soy tu asistente de Fintia.\n\nPuedes escribirme como hablas:\n• _"gasté 15 mil en el mercado"_\n• _"pagué 80 lucas de uber"_\n• _"me pagaron 2 palos de salario"_\n• También puedes enviar una foto de una factura 🧾`,
      );
      return { status: 'help' };
    }

    // Parse with AI
    let parsed: any;
    try {
      if (mediaUrl && mediaType?.startsWith('image/')) {
        const imgResp = await fetch(mediaUrl);
        const buffer = await imgResp.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        parsed = await this.ai.parseTransaction(undefined, base64, mediaType);
      } else if (text) {
        parsed = await this.ai.parseTransaction(text);
      } else {
        await this.whatsapp.sendMessage(from, 'No entendí tu mensaje. Escríbeme el gasto o ingreso en texto o envía una foto de la factura 📸');
        return { status: 'empty' };
      }
    } catch (err) {
      this.logger.error('AI parse error', err);
      await this.whatsapp.sendMessage(from, '😅 No pude entender ese mensaje. Intenta de nuevo, por ejemplo: _"gasté 20 mil en transporte"_');
      return { status: 'ai_error' };
    }

    // Validate parsed result
    if (!parsed.type || !parsed.amount || parsed.amount <= 0) {
      await this.whatsapp.sendMessage(from, '🤔 No entendí bien el monto o el tipo de transacción. Intenta algo como: _"gasté 5 mil en comida"_ o _"me pagaron 500 mil de salario"_');
      return { status: 'invalid_parse' };
    }

    // Resolve category slug → UUID
    const { data: cats } = await this.supabase
      .getClient()
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${userId},is_default.eq.true`)
      .eq('type', parsed.type);

    const targetName = SLUG_TO_NAME[parsed.category_id];
    const category = cats?.find((c) => c.name === targetName) ?? cats?.[0];
    const categoryId = category?.id ?? null;

    // Save transaction
    const today = new Date().toISOString().split('T')[0];
    const { error: txError } = await this.supabase
      .getClient()
      .from('transactions')
      .insert({
        user_id: userId,
        amount: parsed.amount,
        type: parsed.type,
        category_id: categoryId,
        description: parsed.description,
        date: parsed.date || today,
        source: 'whatsapp',
      });

    if (txError) {
      this.logger.error('Transaction insert error', JSON.stringify(txError));
      this.logger.error('Payload:', JSON.stringify({ userId, amount: parsed.amount, type: parsed.type, categoryId, date: parsed.date || today }));
      await this.whatsapp.sendMessage(from, '❌ Hubo un error guardando la transacción. Intenta de nuevo.');
      return { status: 'db_error' };
    }

    const typeEmoji = parsed.type === 'income' ? '💰' : '💸';
    const typeLabel = parsed.type === 'income' ? 'ingreso' : 'gasto';
    const amount = Number(parsed.amount).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    const catName = category?.name ?? 'Sin categoría';

    await this.whatsapp.sendMessage(
      from,
      `${typeEmoji} *${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} registrado*\n\n📋 ${parsed.description}\n🏷️ ${catName}\n💵 ${amount}\n\n_${parsed.message ?? '¡Listo!'}_`,
    );

    return { status: 'ok' };
  }
}
