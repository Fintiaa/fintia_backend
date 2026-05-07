import { Injectable } from '@nestjs/common';
import Twilio from 'twilio';

@Injectable()
export class WhatsappService {
  private client: Twilio.Twilio;
  private from: string;

  constructor() {
    this.client = Twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
    this.from = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`;
  }

  async sendMessage(to: string, body: string) {
    await this.client.messages.create({ from: this.from, to: `whatsapp:${to}`, body });
  }
}
