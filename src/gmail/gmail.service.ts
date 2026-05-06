import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { createOAuth2Client, getAuthUrl } from './gmail-oauth';
import { encrypt } from './gmail-crypto';
import { fetchBankEmails, fetchEmailById } from './gmail-fetcher';
import { parseEmailToTransaction } from './gmail-parser';
import { google } from 'googleapis';

@Injectable()
export class GmailService {
  constructor(private readonly supabase: SupabaseService) {}

  getAuthUrl(userId: string): string {
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    return getAuthUrl(state);
  }

  async handleCallback(code: string, state: string, baseUrl: string) {
    const { userId } = JSON.parse(Buffer.from(state, 'base64url').toString());

    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const gmailEmail = profileRes.data.emailAddress;

    await this.supabase.getClient()
      .from('gmail_connections')
      .upsert({
        user_id: userId,
        gmail_email: gmailEmail,
        access_token_encrypted: encrypt(tokens.access_token!),
        refresh_token_encrypted: encrypt(tokens.refresh_token!),
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        is_active: true,
        sync_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    return `${baseUrl}/dashboard/sync?success=connected`;
  }

  async getStatus(userId: string) {
    const { data: connection } = await this.supabase.getClient()
      .from('gmail_connections')
      .select('id, gmail_email, is_active, last_sync_at, sync_error, created_at')
      .eq('user_id', userId)
      .single();

    return { connection: connection || null };
  }

  async disconnect(userId: string) {
    await this.supabase.getClient()
      .from('gmail_connections')
      .delete()
      .eq('user_id', userId);

    return { success: true };
  }

  async sync(userId: string, forceFullSync = false) {
    const { data: connection } = await this.supabase.getClient()
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!connection) throw new Error('Gmail no conectado');

    const { count: syncedCount } = await this.supabase.getClient()
      .from('synced_emails')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const isFirstSync = (syncedCount || 0) < 5 || forceFullSync;
    const toGmailDate = (ms: number) =>
      new Date(ms).toISOString().split('T')[0].replace(/-/g, '/');
    const overlapMs = 3 * 24 * 60 * 60 * 1000;
    const sinceDate = isFirstSync
      ? toGmailDate(Date.now() - 365 * 24 * 60 * 60 * 1000)
      : connection.last_sync_at
        ? toGmailDate(new Date(connection.last_sync_at).getTime() - overlapMs)
        : toGmailDate(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { emails, newTokens } = await fetchBankEmails(connection, sinceDate, isFirstSync ? 1000 : 300);

    const { data: existingSynced } = await this.supabase.getClient()
      .from('synced_emails')
      .select('gmail_message_id')
      .eq('user_id', userId);

    const existingIds = new Set((existingSynced || []).map((e: any) => e.gmail_message_id));
    const newEmails = emails.filter((e: any) => !existingIds.has(e.id));

    let pending = 0, skipped = 0, errors = 0;

    for (const email of newEmails) {
      try {
        const parsed: any = await parseEmailToTransaction(email);
        const subject = email.headers?.find((h: any) => h.name === 'Subject')?.value || '';
        const from = email.headers?.find((h: any) => h.name === 'From')?.value || '';

        if (!parsed.is_transaction) {
          await this.supabase.getClient().from('synced_emails').insert({
            user_id: userId, gmail_message_id: email.id, subject, sender: from,
            received_at: new Date(parseInt(email.internalDate ?? '0')).toISOString(),
            raw_snippet: email.snippet?.substring(0, 200),
            parsed_data: parsed, status: 'skipped',
          });
          skipped++;
          continue;
        }

        await this.supabase.getClient().from('synced_emails').insert({
          user_id: userId, gmail_message_id: email.id, subject, sender: from,
          received_at: new Date(parseInt(email.internalDate ?? '0')).toISOString(),
          raw_snippet: email.snippet?.substring(0, 200),
          parsed_data: parsed, status: 'pending',
        });
        pending++;
      } catch (err: any) {
        await this.supabase.getClient().from('synced_emails').insert({
          user_id: userId, gmail_message_id: email.id,
          subject: email.headers?.find((h: any) => h.name === 'Subject')?.value || '',
          sender: email.headers?.find((h: any) => h.name === 'From')?.value || '',
          status: 'error', error_message: err.message,
        });
        errors++;
      }
    }

    const updates: any = { last_sync_at: new Date().toISOString(), sync_error: null, updated_at: new Date().toISOString() };
    if (newTokens?.access_token) updates.access_token_encrypted = encrypt(newTokens.access_token);
    if (newTokens?.expiry_date) updates.token_expiry = new Date(newTokens.expiry_date).toISOString();

    await this.supabase.getClient().from('gmail_connections').update(updates).eq('id', connection.id);

    return {
      success: true,
      summary: { total: newEmails.length, pending, skipped, errors },
    };
  }

  async getPending(userId: string) {
    const { data } = await this.supabase.getClient()
      .from('synced_emails')
      .select('id, gmail_message_id, subject, sender, received_at, raw_snippet, parsed_data, created_at')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('received_at', { ascending: false });
    return data || [];
  }

  async approvePending(userId: string, syncedEmailId: string, overrides?: any) {
    const { data: row, error: rowError } = await this.supabase.getClient()
      .from('synced_emails')
      .select('*')
      .eq('id', syncedEmailId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (rowError || !row) throw new Error('Pendiente no encontrada');

    const parsed = row.parsed_data || {};
    const txnData = {
      user_id: userId,
      type: overrides?.type ?? parsed.type,
      amount: overrides?.amount ?? parsed.amount,
      category_id: overrides?.category_id ?? parsed.category_id,
      description: overrides?.description ?? parsed.description,
      date: overrides?.date ?? parsed.date,
      source: 'email',
      metadata: { gmail_message_id: row.gmail_message_id, bank: parsed.bank, confidence: parsed.confidence },
    };

    const { data: txn, error: txnError } = await this.supabase.getClient()
      .from('transactions')
      .insert(txnData)
      .select()
      .single();

    if (txnError) throw txnError;

    await this.supabase.getClient()
      .from('synced_emails')
      .update({ status: 'created', transaction_id: txn.id })
      .eq('id', syncedEmailId);

    return { success: true, transaction: txn };
  }

  async rejectPending(userId: string, syncedEmailId: string) {
    const { error } = await this.supabase.getClient()
      .from('synced_emails')
      .update({ status: 'rejected' })
      .eq('id', syncedEmailId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) throw error;
    return { success: true };
  }

  async reparse(userId: string, limit = 500) {
    const { data: connection } = await this.supabase.getClient()
      .from('gmail_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (!connection) throw new Error('Gmail no conectado');

    const { data: synced } = await this.supabase.getClient()
      .from('synced_emails')
      .select('id, gmail_message_id, transaction_id, status')
      .eq('user_id', userId)
      .eq('status', 'created')
      .not('transaction_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!synced || synced.length === 0) {
      return { success: true, summary: { total: 0, updated: 0, unchanged: 0, errors: 0 } };
    }

    let updated = 0, unchanged = 0, errors = 0;
    let latestTokens: any = null;

    for (const row of synced) {
      try {
        const { email, newTokens } = await fetchEmailById(connection, row.gmail_message_id);
        if (newTokens) latestTokens = newTokens;

        const parsed: any = await parseEmailToTransaction(email);
        if (!parsed.is_transaction) { unchanged++; continue; }

        const { data: existingTxn } = await this.supabase.getClient()
          .from('transactions')
          .select('id, description, category_id, amount, type')
          .eq('id', row.transaction_id)
          .single();

        if (!existingTxn) { unchanged++; continue; }

        const changes: any = {};
        if (existingTxn.description !== parsed.description) changes.description = parsed.description;
        if (existingTxn.category_id !== parsed.category_id) changes.category_id = parsed.category_id;
        if (existingTxn.type !== parsed.type) changes.type = parsed.type;
        if (Math.abs(Number(existingTxn.amount) - parsed.amount) > 0.01) changes.amount = parsed.amount;

        if (Object.keys(changes).length === 0) { unchanged++; continue; }

        await this.supabase.getClient()
          .from('transactions')
          .update(changes)
          .eq('id', row.transaction_id);

        await this.supabase.getClient()
          .from('synced_emails')
          .update({ parsed_data: parsed })
          .eq('id', row.id);

        updated++;
      } catch (err: any) {
        console.error('Reparse error for', row.gmail_message_id, err.message);
        errors++;
      }
    }

    if (latestTokens?.access_token) {
      const updates: any = { access_token_encrypted: encrypt(latestTokens.access_token), updated_at: new Date().toISOString() };
      if (latestTokens.expiry_date) updates.token_expiry = new Date(latestTokens.expiry_date).toISOString();
      await this.supabase.getClient().from('gmail_connections').update(updates).eq('id', connection.id);
    }

    return { success: true, summary: { total: synced.length, updated, unchanged, errors } };
  }

  async getSyncedEmails(userId: string) {
    const { data } = await this.supabase.getClient()
      .from('synced_emails')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    return data || [];
  }
}
