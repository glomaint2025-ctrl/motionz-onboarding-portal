import { NextResponse } from 'next/server';
import { requireAuth, handleAuthError } from '@/lib/auth/guard';
import { auditLogRepository, userRepository } from '@/lib/db/repositories';
import { trainingRepository, isTrainingUnavailable } from '@/lib/db/repositories/training.repository';
import { getTrainingSettings, setTrainingSettings, type TrainingSettings } from '@/lib/db/repositories/app-settings.repository';
import type { TrainingLesson, User } from '@/lib/db/schema';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { validateLessonFields } from '@/lib/training';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };
/** Shown to a CSM Manager while migration 20261008000002_csm_training.sql has not been run. */
const PENDING_MESSAGE =
  'Training is not switched on in the database yet. The one-time database step for CSM Training still has to be run; lessons can be added after that.';

type TrainingStatus = 'exempt' | 'not_started' | 'in_progress' | 'complete';

const presentLesson = (lesson: TrainingLesson) => ({
  id: lesson.id,
  title: lesson.title,
  description: lesson.description || '',
  video_url: lesson.video_url,
  document_url: lesson.document_url || '',
  sort_order: lesson.sort_order,
  is_active: lesson.is_active,
  updated_at: lesson.updated_at,
});

/** Everything the CSM Training page shows, read in four requests however many CSMs there are. */
async function buildPage() {
  const [settings, csms] = await Promise.all([getTrainingSettings(), userRepository.listAllByRole('csm')]);

  let available = true;
  let lessons: TrainingLesson[] = [];
  let allProgress: Awaited<ReturnType<typeof trainingRepository.listAllProgress>> = [];
  try {
    [lessons, allProgress] = await Promise.all([trainingRepository.listLessons(), trainingRepository.listAllProgress()]);
  } catch (error) {
    if (!isTrainingUnavailable(error)) throw error;
    available = false;
  }

  // Hidden lessons do not count towards anyone's progress.
  const activeIds = new Set(lessons.filter((l) => l.is_active).map((l) => l.id));
  const byUser = new Map<string, { finished: number; last: string | null }>();
  for (const row of allProgress) {
    const entry = byUser.get(row.user_id) || { finished: 0, last: null };
    if (activeIds.has(row.lesson_id)) entry.finished += 1;
    if (!entry.last || row.completed_at > entry.last) entry.last = row.completed_at;
    byUser.set(row.user_id, entry);
  }

  const exempt = new Set(settings.exempt_user_ids);
  const total = activeIds.size;
  const progress = csms
    .map((csm: User) => {
      const entry = byUser.get(csm.id) || { finished: 0, last: null };
      const status: TrainingStatus = exempt.has(csm.id)
        ? 'exempt'
        : total > 0 && entry.finished >= total
          ? 'complete'
          : entry.finished > 0
            ? 'in_progress'
            : 'not_started';
      return {
        id: csm.id,
        name: csm.full_name || '',
        email: csm.email,
        disabled: csm.status === 'suspended',
        finished: entry.finished,
        total,
        lastActivity: entry.last,
        status,
        exempt: exempt.has(csm.id),
      };
    })
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  return {
    success: true,
    available,
    ...(available ? {} : { message: PENDING_MESSAGE }),
    settings: { required_for_csms: settings.required_for_csms },
    lessons: lessons.map(presentLesson),
    activeLessons: total,
    progress,
  };
}

function unavailable() {
  return NextResponse.json({ error: PENDING_MESSAGE, code: 'TRAINING_UNAVAILABLE' }, { status: 503 });
}

/** Errors a CSM Manager can fix are answered in plain words; "tables missing" is a 503, never a crash. */
function respondError(err: any) {
  if (isTrainingUnavailable(err)) return unavailable();
  return handleAuthError(err);
}

async function audit(session: { email: string }, action: string, resource: { type: string; id: string }, details: Record<string, any>) {
  await auditLogRepository.create({
    actor_email: session.email,
    actor_role: 'admin',
    action,
    resource_type: resource.type,
    resource_id: resource.id,
    details,
  });
}

async function requireCsm(userId: unknown): Promise<User> {
  const id = typeof userId === 'string' ? userId.trim() : '';
  if (!id) throw new ValidationError('Choose a CSM.');
  const user = await userRepository.findById(id);
  if (!user || user.role !== 'csm') throw new AppError('That CSM could not be found.', 404, 'NOT_FOUND');
  return user;
}

export async function GET(request: Request) {
  try {
    await requireAuth(request, { roles: ['admin'] });
    return NextResponse.json(await buildPage(), { headers: NO_STORE });
  } catch (err: any) {
    return respondError(err);
  }
}

/** Add a lesson: { title, video_url, document_url?, description? }. It goes to the end of the list. */
export async function POST(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = (await request.json().catch(() => ({}))) || {};
    const fields = validateLessonFields(body);

    const lesson = await trainingRepository.createLesson({
      title: fields.title!,
      video_url: fields.video_url!,
      document_url: fields.document_url ?? null,
      description: fields.description ?? null,
      created_by: session.userId,
    });
    await audit(session, 'training.lesson_created', { type: 'training_lesson', id: lesson.id }, { lesson: lesson.title });

    return NextResponse.json({ ...(await buildPage()), lesson: presentLesson(lesson) }, { status: 201, headers: NO_STORE });
  } catch (err: any) {
    return respondError(err);
  }
}

/**
 * Everything that changes something, chosen by `action`:
 *  - update_lesson   { id, title?, video_url?, document_url?, description?, is_active? }
 *  - reorder         { ids }  every lesson id, in the new order
 *  - update_settings { required_for_csms }
 *  - set_exempt      { userId, exempt }
 *  - reset_progress  { userId }
 */
export async function PATCH(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = (await request.json().catch(() => ({}))) || {};

    switch (body.action) {
      case 'update_lesson': {
        const id = typeof body.id === 'string' ? body.id : '';
        const before = id ? await trainingRepository.findLesson(id) : null;
        if (!before) throw new NotFoundError('Lesson');

        const changes: Parameters<typeof trainingRepository.updateLesson>[1] = validateLessonFields(body, { partial: true });
        if (body.is_active !== undefined) {
          if (typeof body.is_active !== 'boolean') throw new ValidationError('Choose whether the lesson is shown or hidden.');
          changes.is_active = body.is_active;
        }
        const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
          (key) => (changes[key] ?? null) !== ((before as any)[key] ?? null)
        );
        if (changed.length === 0) return NextResponse.json({ ...(await buildPage()), changed }, { headers: NO_STORE });

        const lesson = await trainingRepository.updateLesson(id, changes);
        if (!lesson) throw new NotFoundError('Lesson');
        await audit(session, 'training.lesson_updated', { type: 'training_lesson', id }, {
          lesson: lesson.title,
          changed,
          ...(changed.includes('is_active') ? { shown: lesson.is_active } : {}),
        });
        return NextResponse.json({ ...(await buildPage()), changed }, { headers: NO_STORE });
      }

      case 'reorder': {
        const ids: unknown = body.ids;
        const lessons = await trainingRepository.listLessons();
        const known = new Set(lessons.map((l) => l.id));
        const valid =
          Array.isArray(ids) &&
          ids.length === lessons.length &&
          new Set(ids).size === ids.length &&
          ids.every((id) => typeof id === 'string' && known.has(id));
        if (!valid) {
          throw new ValidationError('The lesson list changed while you were reordering. Reload the page and try again.');
        }
        const order = ids as string[];
        if (order.some((id, index) => lessons[index].id !== id)) {
          await trainingRepository.setLessonOrder(order);
          const titles = new Map(lessons.map((l) => [l.id, l.title]));
          await audit(session, 'training.lesson_reordered', { type: 'training_lesson', id: 'order' }, {
            order: order.map((id) => titles.get(id)),
          });
        }
        return NextResponse.json(await buildPage(), { headers: NO_STORE });
      }

      case 'update_settings': {
        if (typeof body.required_for_csms !== 'boolean') throw new ValidationError('Choose whether training is required.');
        const settings = await getTrainingSettings();
        if (settings.required_for_csms !== body.required_for_csms) {
          const next: TrainingSettings = { ...settings, required_for_csms: body.required_for_csms };
          await setTrainingSettings(next, session.email);
          await audit(session, 'training.settings_updated', { type: 'app_setting', id: 'training' }, {
            requiredForCsms: next.required_for_csms,
          });
        }
        return NextResponse.json(await buildPage(), { headers: NO_STORE });
      }

      case 'set_exempt': {
        if (typeof body.exempt !== 'boolean') throw new ValidationError('Choose whether this CSM is exempt.');
        const csm = await requireCsm(body.userId);
        const settings = await getTrainingSettings();
        const isExempt = settings.exempt_user_ids.includes(csm.id);
        if (isExempt !== body.exempt) {
          const exemptIds = body.exempt
            ? [...settings.exempt_user_ids, csm.id]
            : settings.exempt_user_ids.filter((id) => id !== csm.id);
          await setTrainingSettings({ ...settings, exempt_user_ids: exemptIds }, session.email);
          await audit(session, 'training.exemption_changed', { type: 'user', id: csm.id }, {
            email: csm.email,
            exempt: body.exempt,
          });
        }
        return NextResponse.json(await buildPage(), { headers: NO_STORE });
      }

      case 'reset_progress': {
        const csm = await requireCsm(body.userId);
        const cleared = await trainingRepository.resetProgressForUser(csm.id);
        await audit(session, 'training.progress_reset', { type: 'user', id: csm.id }, { email: csm.email, lessonsCleared: cleared });
        return NextResponse.json({ ...(await buildPage()), cleared }, { headers: NO_STORE });
      }

      default:
        throw new ValidationError('That action is not supported.');
    }
  } catch (err: any) {
    return respondError(err);
  }
}

/** Delete a lesson: { id }. Everyone's progress for it goes with it. */
export async function DELETE(request: Request) {
  try {
    const { session } = await requireAuth(request, { roles: ['admin'] });
    const body = (await request.json().catch(() => ({}))) || {};
    const id = typeof body.id === 'string' ? body.id : '';
    const lesson = id ? await trainingRepository.findLesson(id) : null;
    if (!lesson) throw new NotFoundError('Lesson');

    await trainingRepository.deleteLesson(id);
    await audit(session, 'training.lesson_deleted', { type: 'training_lesson', id }, { lesson: lesson.title });
    return NextResponse.json(await buildPage(), { headers: NO_STORE });
  } catch (err: any) {
    return respondError(err);
  }
}
