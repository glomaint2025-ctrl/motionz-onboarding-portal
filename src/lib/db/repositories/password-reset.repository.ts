import { randomUUID, createHash } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { PasswordResetToken } from '../schema';
import { DatabaseError } from '../../errors';

export class PasswordResetRepository {
  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to find password reset token: ${error.message}`, error);
      return data as PasswordResetToken | null;
    }

    const store = getStore();
    return store.passwordResetTokens.find((t) => t.token_hash === tokenHash) || null;
  }

  async create(email: string, rawToken: string, expiresInMinutes: number = 60): Promise<PasswordResetToken> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000).toISOString();
    const tokenHash = this.hashToken(rawToken);

    // Invalidate existing unused tokens for this email
    await this.invalidatePreviousTokens(email);

    const newRecord: PasswordResetToken = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('password_reset_tokens')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to save password reset token: ${error.message}`, error);
      return data as PasswordResetToken;
    }

    const store = getStore();
    store.passwordResetTokens.push(newRecord);
    return newRecord;
  }

  async markUsed(id: string): Promise<void> {
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase
        .from('password_reset_tokens')
        .update({ used_at: now })
        .eq('id', id);

      if (error) throw new DatabaseError(`Failed to mark password reset token as used: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const item = store.passwordResetTokens.find((t) => t.id === id);
    if (item) item.used_at = now;
  }

  async invalidatePreviousTokens(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const now = new Date().toISOString();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      await supabase
        .from('password_reset_tokens')
        .update({ used_at: now })
        .eq('email', normalized)
        .is('used_at', null);
      return;
    }

    const store = getStore();
    store.passwordResetTokens.forEach((t) => {
      if (t.email === normalized && !t.used_at) {
        t.used_at = now;
      }
    });
  }
}

export const passwordResetRepository = new PasswordResetRepository();
