import { ICRMService, ISheetsService, INotificationService, IRoofMeasurementService, IOrdersService } from './types';
import { GoHighLevelService } from './ghl/client';
import { GoogleSheetsService } from './sheets/client';
import { SlackNotificationService } from './slack/notifier';
import { RoofMeasurementAdapter } from './roof/adapter';
import { OrdersService } from './orders/service';

export class IntegrationRegistry {
  private crmService: ICRMService;
  private sheetsService: ISheetsService;
  private notificationService: INotificationService;
  private roofService: IRoofMeasurementService;
  private ordersService: IOrdersService;

  constructor() {
    this.crmService = new GoHighLevelService();
    this.sheetsService = new GoogleSheetsService();
    this.notificationService = new SlackNotificationService();
    this.roofService = new RoofMeasurementAdapter();
    this.ordersService = new OrdersService();
  }

  getCRM(): ICRMService {
    return this.crmService;
  }

  getSheets(): ISheetsService {
    return this.sheetsService;
  }

  getNotifications(): INotificationService {
    return this.notificationService;
  }

  getRoof(): IRoofMeasurementService {
    return this.roofService;
  }

  getOrders(): IOrdersService {
    return this.ordersService;
  }

  setCRM(service: ICRMService) {
    this.crmService = service;
  }

  setSheets(service: ISheetsService) {
    this.sheetsService = service;
  }

  setNotifications(service: INotificationService) {
    this.notificationService = service;
  }
}

export const integrationRegistry = new IntegrationRegistry();
