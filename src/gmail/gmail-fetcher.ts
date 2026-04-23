import { google } from 'googleapis';
import { createOAuth2Client } from './gmail-oauth';
import { decrypt } from './gmail-crypto';

const BANK_SENDER_DOMAINS = [
  'bancolombia', 'notificacionesbancolombia', 'davivienda',
  'bbva.com.co', 'bancodebogota', 'nequi', 'daviplata',
  'colpatria', 'scotiabankcolpatria', 'bancopopular',
  'bancodeoccidente', 'bancoomeva', 'nubank', 'lulobank',
];

export async function fetchBankEmails(
  connection: Record<string, any>,
  sinceDate: string | null = null,
  maxResults = 50,
) {
  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: decrypt(connection.access_token_encrypted),
    refresh_token: decrypt(connection.refresh_token_encrypted),
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
  });

  let newTokens: any = null;
  oauth2Client.on('tokens', (tokens) => { newTokens = tokens; });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const senderQuery = BANK_SENDER_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  let query = `(${senderQuery})`;
  if (sinceDate) query += ` after:${sinceDate}`;

  const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });

  if (!res.data.messages) return { emails: [], newTokens };

  const emails = await Promise.all(
    res.data.messages.map(async (msg) => {
      const full = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
      return {
        id: msg.id,
        headers: full.data.payload!.headers,
        snippet: full.data.snippet,
        body: extractBody(full.data.payload!),
        internalDate: full.data.internalDate,
      };
    }),
  );

  return { emails, newTokens };
}

function extractBody(payload: any): string {
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8');
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data)
        return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data)
        return Buffer.from(part.body.data, 'base64url').toString('utf8');
    }
  }
  return '';
}
