import { IOrdersService, Order } from '../types';
import { orderRepository } from '../../db/repositories';

export class OrdersService implements IOrdersService {
  async getOrderDetails(orderNumber: string): Promise<Order | null> {
    return orderRepository.findByOrderNumber(orderNumber);
  }

  async trackCarrier(carrier: string, trackingNumber: string): Promise<{
    status: string;
    estimatedDelivery: string;
    trackingUrl: string;
  }> {
    const normalizedCarrier = carrier.toLowerCase();
    let trackingUrl = `https://tracking.carrier.example.com/${trackingNumber}`;

    if (normalizedCarrier.includes('fedex')) {
      trackingUrl = `https://fedex.com/tracking?id=${trackingNumber}`;
    } else if (normalizedCarrier.includes('ups')) {
      trackingUrl = `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (normalizedCarrier.includes('usps')) {
      trackingUrl = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    }

    return {
      status: 'In Transit - On Schedule',
      estimatedDelivery: 'Thursday, Sep 24 by 4:00 PM',
      trackingUrl,
    };
  }

  async createReorderRequest(tenantId: string, itemDescription: string): Promise<{ requestId: string; success: boolean }> {
    return {
      requestId: `req-${Date.now()}`,
      success: true,
    };
  }
}

export const ordersService = new OrdersService();
