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
  const promoExclusions = [
    'category:promotions', 'category:social',
    '"oferta"', '"ofertas"', '"preaprobado"', '"pre-aprobado"', '"pre aprobado"',
    '"cupo disponible"', '"aumento de cupo"', '"tarjeta de crédito aprobada"',
    '"crédito preaprobado"', '"credito preaprobado"', '"libranza"',
    '"libre inversión"', '"libre inversion"', '"tasa preferencial"',
    '"promoción"', '"promocion"', '"newsletter"', '"boletín"', '"boletin"',
    '"estado de cuenta"', '"extracto"',
  ];
  const exclusionQuery = promoExclusions.map((t) => `-${t}`).join(' ');
  let query = `(${senderQuery}) ${exclusionQuery}`;
  if (sinceDate) query += ` after:${sinceDate}`;

  const messageIds: string[] = [];
  let pageToken: string | undefined;
  const pageSize = 100;

  do {
    const res: any = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: Math.min(pageSize, maxResults - messageIds.length),
      pageToken,
    });
    if (res.data.messages) {
      for (const m of res.data.messages) {
        if (m.id) messageIds.push(m.id);
        if (messageIds.length >= maxResults) break;
      }
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken && messageIds.length < maxResults);

  if (messageIds.length === 0) return { emails: [], newTokens };

  const emails: any[] = [];
  const concurrency = 10;
  for (let i = 0; i < messageIds.length; i += concurrency) {
    const batch = messageIds.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (id) => {
        const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        return {
          id,
          headers: full.data.payload!.headers,
          snippet: full.data.snippet,
          body: extractBody(full.data.payload!),
          internalDate: full.data.internalDate,
        };
      }),
    );
    emails.push(...results);
  }

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
