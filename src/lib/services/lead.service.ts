import { leadRepository, appointmentRepository } from '../db/repositories';
import { Lead, Appointment } from '../db/schema';
import { parsePaginationParams } from '../validation';

export class LeadService {
  async getTenantLeads(
    tenantId: string,
    options?: { status?: string; limit?: number; offset?: number }
  ): Promise<{ leads: Lead[]; totalRetrieved: number }> {
    const { limit, offset } = parsePaginationParams({
      limit: options?.limit,
      offset: options?.offset,
      defaultLimit: 50,
      maxLimit: 200,
    });

    const leads = await leadRepository.listByTenant(tenantId, {
      status: options?.status,
      limit,
      offset,
    });

    return {
      leads,
      totalRetrieved: leads.length,
    };
  }

  async getTenantAppointments(tenantId: string, limit = 20): Promise<Appointment[]> {
    const { limit: safeLimit } = parsePaginationParams({
      limit,
      defaultLimit: 20,
      maxLimit: 100,
    });

    return appointmentRepository.listByTenant(tenantId, safeLimit);
  }
}

export const leadService = new LeadService();
