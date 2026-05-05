import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import MercadoPago, { Preference } from 'mercadopago';

@Injectable()
export class PaymentsService {
  private mp: MercadoPago;
  private preference: Preference;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.mp = new MercadoPago({
      accessToken: this.config.get<string>('MP_ACCESS_TOKEN') as string,
    });
    this.preference = new Preference(this.mp);
  }

  async createCheckout(userId: string, frontendUrl: string) {
    const result = await this.preference.create({
      body: {
        items: [
          {
            id: 'premium-monthly',
            title: 'Fintia Premium - Mensual',
            quantity: 1,
            unit_price: 1.50,
            currency_id: 'USD',
          },
        ],
        back_urls: {
          success: `${frontendUrl}/es/dashboard/settings?payment=success`,
          failure: `${frontendUrl}/es/dashboard/settings?payment=failure`,
          pending: `${frontendUrl}/es/dashboard/settings?payment=pending`,
        },
        auto_return: 'approved',
        external_reference: userId,
        notification_url: `${this.config.get('BACKEND_URL')}/payments/webhook`,
      },
    });

    return { checkoutUrl: result.init_point };
  }

  async handleWebhook(body: any) {
    if (body.type !== 'payment') return { received: true };

    const { MercadoPagoConfig, Payment } = await import('mercadopago');
    const client = new MercadoPagoConfig({
      accessToken: this.config.get<string>('MP_ACCESS_TOKEN') as string,
    });
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: body.data?.id });

    if (payment.status !== 'approved') return { received: true };

    const userId = payment.external_reference;
    if (!userId) throw new BadRequestException('Missing external_reference');

    await this.supabase
      .getClient()
      .from('profiles')
      .update({ subscription_tier: 'premium' })
      .eq('id', userId);

    return { received: true };
  }
}
