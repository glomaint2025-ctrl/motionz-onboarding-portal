import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { enforceRateLimit } from '@/lib/auth/security-utils';
import { SLACK_TEST_TEXT } from '@/lib/lead-requests/slack';
import { postToSlack, savedSlackWebhookUrl } from '@/lib/lead-requests/slack-send';

export const runtime = 'nodejs';

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * POST /api/admin/settings/slack/test
 * Posts "Test message from the Motionz portal" to the saved Slack link and says whether Slack took it.
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });

    const limit = await enforceRateLimit(`slack_test:${session!.userId}`, { maxRequests: 10, windowMs: TEN_MINUTES });
    if (!limit.allowed) {
      return NextResponse.json({ error: 'You have sent many test messages. Please wait a few minutes and try again.' }, { status: 429 });
    }

    const url = await savedSlackWebhookUrl();
    if (!url) {
      return NextResponse.json({ error: 'Save a Slack webhook link first.' }, { status: 400 });
    }

    const result = await postToSlack(url, SLACK_TEST_TEXT);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.statusCode === 401 || err.statusCode === 403) return handleAuthError(err);
    return NextResponse.json({ error: 'The test message could not be sent. Please try again.' }, { status: 500 });
  }
}
