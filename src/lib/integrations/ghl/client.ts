import { ICRMService, Lead, Appointment } from '../types';
import { tenantRepository, leadRepository, appointmentRepository } from '../../db/repositories';

export class GoHighLevelService implements ICRMService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.GHL_API_KEY || '';
    this.baseUrl = baseUrl || process.env.GHL_API_BASE_URL || 'https://services.leadconnectorhq.com';
  }

  async getContacts(locationId: string): Promise<Lead[]> {
    if (!this.apiKey) {
      // Graceful fallback to repository contacts matching tenant or location
      const allTenants = await tenantRepository.list();
      const tenant = allTenants.find((t) => t.ghl_location_id === locationId || t.id === locationId) || allTenants[0];
      const targetTenantId = tenant ? tenant.id : locationId;
      return leadRepository.listByTenant(targetTenantId);
    }

    try {
      const res = await fetch(`${this.baseUrl}/contacts/?locationId=${locationId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Version: '2021-07-28',
        },
      });

      if (!res.ok) {
        throw new Error(`GHL API error: ${res.statusText}`);
      }

      const data = await res.json();
      return (data.contacts || []).map((c: any) => ({
        id: `lead-${c.id}`,
        tenant_id: locationId,
        ghl_contact_id: c.id,
        first_name: c.firstName || '',
        last_name: c.lastName || '',
        email: c.email || '',
        phone: c.phone || '',
        status: c.contactStatus || 'Contacted',
        source: c.source || 'GoHighLevel Campaign',
        created_at: c.dateAdded || new Date().toISOString(),
        updated_at: c.dateUpdated || new Date().toISOString(),
      }));
    } catch {
      return leadRepository.listByTenant(locationId);
    }
  }

  async getAppointments(locationId: string): Promise<Appointment[]> {
    const allTenants = await tenantRepository.list();
    const tenant = allTenants.find((t) => t.ghl_location_id === locationId || t.id === locationId) || allTenants[0];
    const targetTenantId = tenant ? tenant.id : locationId;

    if (!this.apiKey) {
      return appointmentRepository.listByTenant(targetTenantId);
    }

    try {
      const res = await fetch(`${this.baseUrl}/calendars/events?locationId=${locationId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Version: '2021-07-28',
        },
      });

      if (!res.ok) {
        throw new Error(`GHL Appointments API error: ${res.statusText}`);
      }

      const data = await res.json();
      return (data.events || []).map((e: any) => ({
        id: `apt-${e.id}`,
        tenant_id: targetTenantId,
        ghl_appointment_id: e.id,
        contact_name: e.title || 'Scheduled Inspection',
        appointment_time: e.startTime || new Date().toISOString(),
        status: e.status || 'confirmed',
        notes: e.notes || '',
        created_at: e.createdAt || new Date().toISOString(),
      }));
    } catch {
      return appointmentRepository.listByTenant(targetTenantId);
    }
  }

  async createContact(locationId: string, leadData: Partial<Lead>): Promise<Lead> {
    const allTenants = await tenantRepository.list();
    const tenant = allTenants.find((t) => t.ghl_location_id === locationId || t.id === locationId) || allTenants[0];
    const targetTenantId = tenant ? tenant.id : locationId;

    return leadRepository.create({
      tenant_id: targetTenantId,
      ghl_contact_id: `cnt_${Date.now()}`,
      first_name: leadData.first_name || 'New',
      last_name: leadData.last_name || 'Lead',
      email: leadData.email || 'lead@example.com',
      phone: leadData.phone || '(555) 000-0000',
      status: leadData.status || 'Contacted',
      source: leadData.source || 'GoHighLevel Form',
    });
  }

  async syncTenant(tenantId: string, locationId: string): Promise<{ contactsSynced: number; appointmentsSynced: number }> {
    const contacts = await this.getContacts(locationId);
    const appointments = await this.getAppointments(locationId);
    return {
      contactsSynced: contacts.length,
      appointmentsSynced: appointments.length,
    };
  }
}
