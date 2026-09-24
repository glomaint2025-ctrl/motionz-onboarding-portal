import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { Order } from '../schema';
import { DatabaseError } from '../../errors';

export class OrderRepository {
  async listByTenant(tenantId: string): Promise<Order[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw new DatabaseError(`Failed to fetch orders: ${error.message}`, error);
      return (data || []) as Order[];
    }

    const store = getStore();
    return store.orders.filter((o) => o.tenant_id === tenantId);
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('order_number', orderNumber)
        .maybeSingle();

      if (error) throw new DatabaseError(`Failed to fetch order: ${error.message}`, error);
      return data as Order | null;
    }

    const store = getStore();
    return store.orders.find((o) => o.order_number === orderNumber) || null;
  }

  async create(order: Omit<Order, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Order> {
    const now = new Date().toISOString();
    const id = order.id || randomUUID();
    const newRecord: Order = {
      ...order,
      id,
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .insert(newRecord)
        .select('*')
        .single();

      if (error) throw new DatabaseError(`Failed to create order: ${error.message}`, error);
      return data as Order;
    }

    const store = getStore();
    store.orders.push(newRecord);
    return newRecord;
  }
}

export const orderRepository = new OrderRepository();
