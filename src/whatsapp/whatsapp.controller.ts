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

const IS_YES = /^(s[ií]|yes|dale|ok|listo|claro|obvio|si+|sí+)$/i;
const IS_NO  = /^(no+|nel|nop|nope|cancelar|cancel)$/i;

interface PendingTx {
  userId: string;
  firstName: string;
  amount: number;
  type: string;
  categoryId: string | null;
  categoryName: string;
  description: string;
  date: string;
  aiMessage: string;
}

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);
  private readonly pending = new Map<string, PendingTx>();

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

    // --- Confirmation flow ---
    if (this.pending.has(from)) {
      const tx = this.pending.get(from)!;

      if (IS_YES.test(text || '')) {
        this.pending.delete(from);
        return this.saveTransaction(from, tx);
      }

      if (IS_NO.test(text || '')) {
        this.pending.delete(from);
        await this.whatsapp.sendMessage(from, '👌 Cancelado, no guardé nada. Cuando quieras registrar algo me avisas.');
        return { status: 'cancelled' };
      }

      // Not yes/no → ask again
      await this.whatsapp.sendMessage(from, '¿Confirmo o cancelo? Responde *sí* o *no* 👆');
      return { status: 'awaiting_confirm' };
    }

    // --- Lookup user ---
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

    // --- Help command ---
    if (/^(ayuda|help|hola|inicio|menu|menú|\?)$/i.test(text || '')) {
      await this.whatsapp.sendMessage(
        from,
        `¡Hola ${firstName}! 👋 Soy tu asistente de Fintia.\n\nPuedes escribirme como hablas:\n• _"gasté 15 mil en el mercado"_\n• _"pagué 80 lucas de uber"_\n• _"me pagaron 2 palos de salario"_\n• También puedes enviar una 📸 foto de factura o 🎙️ nota de voz`,
      );
      return { status: 'help' };
    }

    // --- Parse with AI ---
    let parsed: any;
    try {
      const basicAuth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

      if (mediaUrl && mediaType?.startsWith('image/')) {
        await this.whatsapp.sendMessage(from, '🧾 Analizando tu factura...');
        const imgResp = await fetch(mediaUrl, { headers: { Authorization: `Basic ${basicAuth}` } });
        const buffer = await imgResp.arrayBuffer();
        parsed = await this.ai.parseTransaction(undefined, Buffer.from(buffer).toString('base64'), mediaType);
      } else if (mediaUrl && mediaType?.startsWith('audio/')) {
        await this.whatsapp.sendMessage(from, '🎙️ Escuchando tu nota de voz...');
        const audioResp = await fetch(mediaUrl, { headers: { Authorization: `Basic ${basicAuth}` } });
        const transcription = await this.ai.transcribeAudio(Buffer.from(await audioResp.arrayBuffer()), mediaType);
        this.logger.log(`Transcripción: "${transcription}"`);
        parsed = await this.ai.parseTransaction(transcription);
      } else if (text) {
        parsed = await this.ai.parseTransaction(text);
      } else {
        await this.whatsapp.sendMessage(from, 'No entendí tu mensaje. Escríbeme el gasto, envía una 📸 foto de factura o una 🎙️ nota de voz');
        return { status: 'empty' };
      }
    } catch (err) {
      this.logger.error('AI parse error', err);
      await this.whatsapp.sendMessage(from, '😅 No pude entender ese mensaje. Intenta de nuevo, por ejemplo: _"gasté 20 mil en transporte"_');
      return { status: 'ai_error' };
    }

    if (!parsed.type || !parsed.amount || parsed.amount <= 0) {
      await this.whatsapp.sendMessage(from, '🤔 No entendí bien el monto o tipo. Intenta: _"gasté 5 mil en comida"_ o _"me pagaron 500 mil de salario"_');
      return { status: 'invalid_parse' };
    }

    // --- Resolve category ---
    const { data: cats } = await this.supabase
      .getClient()
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${userId},is_default.eq.true`)
      .eq('type', parsed.type);

    const targetName = SLUG_TO_NAME[parsed.category_id];
    const category = cats?.find((c) => c.name === targetName) ?? cats?.[0];
    const today = new Date().toISOString().split('T')[0];

    const tx: PendingTx = {
      userId,
      firstName,
      amount: parsed.amount,
      type: parsed.type,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? 'Sin categoría',
      description: parsed.description,
      date: parsed.date || today,
      aiMessage: parsed.message ?? '',
    };

    // --- Ask for confirmation ---
    this.pending.set(from, tx);

    const typeEmoji = tx.type === 'income' ? '💰' : '💸';
    const typeLabel = tx.type === 'income' ? 'Ingreso' : 'Gasto';
    const amount = tx.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    await this.whatsapp.sendMessage(
      from,
      `${typeEmoji} *¿Registro esto?*\n\n📋 ${tx.description}\n🏷️ ${tx.categoryName}\n💵 ${amount}\n📅 ${tx.date}\n📌 ${typeLabel}\n\nResponde *sí* para guardar o *no* para cancelar`,
    );

    return { status: 'pending_confirm' };
  }

  private async saveTransaction(from: string, tx: PendingTx) {
    const { error: txError } = await this.supabase
      .getClient()
      .from('transactions')
      .insert({
        user_id: tx.userId,
        amount: tx.amount,
        type: tx.type,
        category_id: tx.categoryId,
        description: tx.description,
        date: tx.date,
        source: 'whatsapp',
      });

    if (txError) {
      this.logger.error('Transaction insert error', JSON.stringify(txError));
      await this.whatsapp.sendMessage(from, '❌ Hubo un error guardando la transacción. Intenta de nuevo.');
      return { status: 'db_error' };
    }

    const typeEmoji = tx.type === 'income' ? '💰' : '💸';
    const amount = tx.amount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

    await this.whatsapp.sendMessage(
      from,
      `✅ *¡Guardado!*\n\n${typeEmoji} ${tx.description} — ${amount}\n🏷️ ${tx.categoryName}\n\n_${tx.aiMessage || '¡Listo, ya quedó en tu Fintia!'}_`,
    );

    return { status: 'ok' };
  }
}
