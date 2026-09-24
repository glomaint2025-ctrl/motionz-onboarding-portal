import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { User, UserRole } from '../schema';
import { DatabaseError, NotFoundError } from '../../errors';

export class UserRepository {
  async findById(userId: string): Promise<User | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to fetch user: ${error.message}`, error);
      return data as User | null;
    }

    const store = getStore();
    return store.users.find((u) => u.id === userId) || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normalized)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to fetch user by email: ${error.message}`, error);
      return data as User | null;
    }

    const store = getStore();
    return store.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });

      if (error) throw new DatabaseError(`Failed to list tenant users: ${error.message}`, error);
      return (data || []) as User[];
    }

    const store = getStore();
    return store.users.filter((u) => u.tenant_id === tenantId);
  }

  async create(user: Omit<User, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<User> {
    const now = new Date().toISOString();
    const id = user.id || randomUUID();
    const newRecord: User = {
      ...user,
      id,
      email: user.email.trim().toLowerCase(),
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create user: ${error.message}`, error);
      return data as User;
    }

    const store = getStore();
    store.users.push(newRecord);
    return newRecord;
  }

  async update(userId: string, updates: Partial<User>): Promise<User> {
    const now = new Date().toISOString();
    const cleanUpdates = { ...updates, updated_at: now };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('users')
        .update(cleanUpdates)
        .eq('id', userId)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to update user: ${error.message}`, error);
      if (!data) throw new NotFoundError('User', userId);
      return data as User;
    }

    const store = getStore();
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new NotFoundError('User', userId);

    Object.assign(user, cleanUpdates);
    return user;
  }

  async delete(userId: string): Promise<void> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw new DatabaseError(`Failed to delete user: ${error.message}`, error);
      return;
    }

    const store = getStore();
    const idx = store.users.findIndex((u) => u.id === userId);
    if (idx !== -1) store.users.splice(idx, 1);
  }
}

export const userRepository = new UserRepository();
