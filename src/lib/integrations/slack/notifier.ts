import { INotificationService, OperationalAlert } from '../types';
import { logAuditEvent } from '../../db';

export class SlackNotificationService implements INotificationService {
  private webhookUrl: string;

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl || process.env.SLACK_WEBHOOK_URL || '';
  }

  async sendAlert(alert: OperationalAlert): Promise<{ success: boolean; messageId?: string }> {
    const payload = {
      text: `[Motionz Alert] ${alert.title}: ${alert.message}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: alert.title,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Tenant ID:* ${alert.tenantId}`,
            },
            {
              type: 'mrkdwn',
              text: `*Event Type:* ${alert.type}`,
            },
            {
              type: 'mrkdwn',
              text: `*Timestamp:* ${alert.timestamp}`,
            },
            {
              type: 'mrkdwn',
              text: `*Actor:* ${alert.actorEmail || 'System'}`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: alert.message,
          },
        },
      ],
    };

    if (!this.webhookUrl) {
      // In local dev / test mode without webhook URL, log audit event
      await logAuditEvent({
        tenantId: alert.tenantId,
        actorEmail: alert.actorEmail || 'system@motionz.ai',
        actorRole: 'notification_service',
        action: `slack.alert_dispatched.${alert.type}`,
        resourceType: 'operational_alert',
        details: { title: alert.title, message: alert.message },
      });

      return { success: true, messageId: `msg-mock-${Date.now()}` };
    }

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return { success: res.ok, messageId: `msg-${Date.now()}` };
    } catch {
      return { success: false };
    }
  }
}

export const slackNotifier = new SlackNotificationService();
