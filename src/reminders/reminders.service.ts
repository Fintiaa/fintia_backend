import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class RemindersService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendReminderEmail(toEmail: string, name: string) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurado');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    const html = `
      <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f7f8f7;">
        <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
          <h1 style="font-size: 20px; color: #2a2e26; margin: 0 0 8px;">🔔 Tienes 3 días sin registrar movimientos</h1>
          <p style="color: #6b7280; margin: 0 0 24px; font-size: 15px;">
            Hola ${name}, llevas varios días sin registrar gastos o ingresos en Fintia.
            Mantener tu historial al día te ayuda a entender mejor tus finanzas 💚
          </p>
          <a href="${frontendUrl}/dashboard"
             style="display: block; text-align: center; background: #7ab98d; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Registrar un movimiento
          </a>
          <p style="text-align: center; color: #9ca3af; font-size: 12px; margin: 20px 0 0;">
            Puedes desactivar estos recordatorios en <a href="${frontendUrl}/dashboard/settings" style="color: #7ab98d;">Configuración</a>.
          </p>
        </div>
      </div>
    `;

    await this.resend.emails.send({
      from: 'Fintia <onboarding@resend.dev>',
      to: toEmail,
      subject: '🔔 No has registrado gastos en los últimos 3 días',
      html,
    });

    return { ok: true };
  }
}
