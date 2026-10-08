import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { auditLogRepository } from '@/lib/db/repositories';
import { isTrainingUnavailable } from '@/lib/db/repositories/training.repository';
import { finishLesson, getTrainingOverview } from '@/lib/training';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
const NOT_SET_UP = 'Training is not set up yet.';

/**
 * The signed-in person's own training: lessons in order, what they finished, what is locked.
 * A CSM Manager gets a preview with every lesson unlocked.
 */
export async function GET(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['csm', 'admin'] });
    const training = await getTrainingOverview(session.userId, { preview: session.role === 'admin' });
    return NextResponse.json(
      { success: true, ...training, ...(training.available ? {} : { message: NOT_SET_UP }) },
      { headers: NO_STORE }
    );
  } catch (err: any) {
    return handleAuthError(err);
  }
}

/**
 * "Finish" on a lesson: { lessonId }. Always for the signed-in person. It must be their next
 * unlocked lesson; finishing a lesson twice changes nothing.
 */
export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['csm', 'admin'] });
    const body = await request.json().catch(() => ({}));
    const lessonId = typeof body?.lessonId === 'string' ? body.lessonId.trim() : '';
    if (!lessonId) {
      return NextResponse.json({ error: 'Choose a lesson to finish.', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const preview = session.role === 'admin';
    let result;
    try {
      result = await finishLesson(session.userId, lessonId, { preview });
    } catch (error) {
      if (isTrainingUnavailable(error)) {
        return NextResponse.json({ error: NOT_SET_UP, code: 'TRAINING_UNAVAILABLE' }, { status: 503 });
      }
      throw error;
    }

    if (result.created) {
      await auditLogRepository.create({
        actor_email: session.email,
        actor_role: session.role,
        action: 'training.lesson_finished',
        resource_type: 'training_lesson',
        resource_id: result.lesson.id,
        details: { lesson: result.lesson.title },
      });
    }

    const training = await getTrainingOverview(session.userId, { preview });
    return NextResponse.json(
      { success: true, alreadyFinished: !result.created, finishedAt: result.completedAt, ...training },
      { headers: NO_STORE }
    );
  } catch (err: any) {
    return handleAuthError(err);
  }
}
