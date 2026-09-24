import { Lead, Appointment, Order } from '../db/schema';
export type { Lead, Appointment, Order };

export interface OperationalAlert {
  type: 'milestone_completed' | 'website_change_requested' | 'security_intrusion' | 'supply_reorder';
  tenantId: string;
  actorEmail?: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface SheetsCampaignRow {
  week: string;
  leads: number;
  appointments: number;
  adSpend: number;
  costPerLead: number;
}

export interface SheetsSyncResult {
  spreadsheetId: string;
  tabName: string;
  syncedAt: string;
  rows: SheetsCampaignRow[];
  totalLeads: number;
  totalAdSpend: number;
  averageCpl: number;
}

export interface RoofEstimateResult {
  address: string;
  squareFootage: number;
  squares: number;
  pitch: string;
  confidenceScore: number;
  satelliteProvider: string;
  reportUrl?: string;
}

export interface ICRMService {
  getContacts(locationId: string): Promise<Lead[]>;
  getAppointments(locationId: string): Promise<Appointment[]>;
  createContact(locationId: string, lead: Partial<Lead>): Promise<Lead>;
  syncTenant(tenantId: string, locationId: string): Promise<{ contactsSynced: number; appointmentsSynced: number }>;
}

export interface ISheetsService {
  getCampaignData(spreadsheetId: string, tabName?: string): Promise<SheetsSyncResult>;
  syncTrackingMetrics(tenantId: string): Promise<SheetsSyncResult>;
}

export interface INotificationService {
  sendAlert(alert: OperationalAlert): Promise<{ success: boolean; messageId?: string }>;
}

export interface IRoofMeasurementService {
  estimateRoofArea(address: string, pitch?: string): Promise<RoofEstimateResult>;
}

export interface IOrdersService {
  getOrderDetails(orderNumber: string): Promise<Order | null>;
  trackCarrier(carrier: string, trackingNumber: string): Promise<{ status: string; estimatedDelivery: string; trackingUrl: string }>;
}
