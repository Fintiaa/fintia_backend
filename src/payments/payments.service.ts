import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import MercadoPago, { PreApproval } from 'mercadopago';

@Injectable()
export class PaymentsService {
  private mp: MercadoPago;
  private preApproval: PreApproval;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.mp = new MercadoPago({
      accessToken: this.config.get<string>('MP_ACCESS_TOKEN') as string,
    });
    this.preApproval = new PreApproval(this.mp);
  }

  async createCheckout(userId: string, frontendUrl: string) {
    const result = await this.preApproval.create({
      body: {
        reason: 'Fintia Premium - Mensual',
        external_reference: userId,
        payer_email: undefined,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 2000,
          currency_id: 'COP',
        },
        back_url: `${frontendUrl}/es/dashboard/settings?payment=success`,
        status: 'pending',
      },
    });

    return { checkoutUrl: result.init_point };
  }

  async handleWebhook(body: any) {
    console.log('[Webhook MP]', JSON.stringify(body));

    try {
      const { MercadoPagoConfig, PreApproval: PreApprovalClient } = await import('mercadopago');
      const client = new MercadoPagoConfig({
        accessToken: this.config.get<string>('MP_ACCESS_TOKEN') as string,
      });

      if (body.type === 'subscription_preapproval') {
        const preApprovalClient = new PreApprovalClient(client);
        const subscription = await preApprovalClient.get({ id: body.data?.id });

        console.log('[Webhook MP] subscription status:', subscription.status);
        if (subscription.status !== 'authorized') return { received: true };

        const userId = subscription.external_reference;
        console.log('[Webhook MP] userId:', userId);
        if (!userId) return { received: true };

        const { error } = await this.supabase
          .getClient()
          .from('profiles')
          .update({ subscription_tier: 'premium' })
          .eq('id', userId);
        console.log('[Webhook MP] update error:', error);
      }
    } catch (err: any) {
      console.log('[Webhook MP Error]', err?.message);
    }

    return { received: true };
  }
}
