/**
 * CSM training: the rules shared by the CSM page, the CSM Manager page and the access check.
 * Server only (reads the database). The browser imports ./embed directly.
 */
import { trainingRepository, isTrainingUnavailable } from '../db/repositories/training.repository';
import { getTrainingSettings } from '../db/repositories/app-settings.repository';
import type { TrainingLesson } from '../db/schema';
import { AppError, NotFoundError, ValidationError } from '../errors';
import { parseHttpsUrl } from './embed';

export const LESSON_TITLE_MAX = 200;
export const LESSON_VIDEO_URL_MAX = 500;
export const LESSON_DESCRIPTION_MAX = 2000;

/** What a CSM reads when the access check stops them. */
export const TRAINING_REQUIRED_MESSAGE = 'Finish your training to unlock your clients.';

export interface LessonFields {
  title?: string;
  description?: string | null;
  video_url?: string;
}

/**
 * Checks what a CSM Manager typed for a lesson. With `partial`, only the fields that were sent
 * are checked (editing); without it, title and video link are required (adding).
 */
export function validateLessonFields(input: Record<string, unknown>, options: { partial?: boolean } = {}): LessonFields {
  const fields: LessonFields = {};

  if (!options.partial || input.title !== undefined) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new ValidationError('Give the lesson a title.');
    if (title.length > LESSON_TITLE_MAX) throw new ValidationError(`The title is too long (${LESSON_TITLE_MAX} characters at most).`);
    fields.title = title;
  }

  if (!options.partial || input.video_url !== undefined) {
    const link = typeof input.video_url === 'string' ? input.video_url.trim() : '';
    if (!link) throw new ValidationError('Add the link to the video.');
    if (link.length > LESSON_VIDEO_URL_MAX) throw new ValidationError(`The video link is too long (${LESSON_VIDEO_URL_MAX} characters at most).`);
    if (!parseHttpsUrl(link)) throw new ValidationError('The video link must be a full link that starts with https://');
    fields.video_url = link;
  }

  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== 'string') {
      throw new ValidationError('The description must be text.');
    }
    const description = (input.description || '').trim();
    if (description.length > LESSON_DESCRIPTION_MAX) {
      throw new ValidationError(`The description is too long (${LESSON_DESCRIPTION_MAX} characters at most).`);
    }
    fields.description = description || null;
  }

  return fields;
}

export interface LessonView {
  id: string;
  /** 1 for the first lesson, and so on. */
  number: number;
  title: string;
  description: string | null;
  /** Not sent while the lesson is still locked. */
  video_url: string | null;
  finished_at: string | null;
  locked: boolean;
}

export interface TrainingOverview {
  /** False while the database step for training has not been done yet. */
  available: boolean;
  lessons: LessonView[];
  total: number;
  finished: number;
  complete: boolean;
  /** The "CSMs must finish training" setting is on. */
  required: boolean;
  /** A CSM Manager let this person skip the training. */
  exempt: boolean;
  /** This person cannot open their clients until they finish. */
  blocked: boolean;
  /** A CSM Manager looking at the page: nothing is locked. */
  preview: boolean;
}

/**
 * The training as one person sees it: active lessons in order, what they finished, what is
 * still locked. `preview` (a CSM Manager) unlocks every lesson.
 */
export async function getTrainingOverview(userId: string, options: { preview?: boolean } = {}): Promise<TrainingOverview> {
  const preview = Boolean(options.preview);
  const settings = await getTrainingSettings();
  const exempt = settings.exempt_user_ids.includes(userId);

  let lessons: TrainingLesson[];
  let finishedAt: Map<string, string>;
  try {
    const [active, progress] = await Promise.all([
      trainingRepository.listLessons({ activeOnly: true }),
      trainingRepository.listProgressForUser(userId),
    ]);
    lessons = active;
    finishedAt = new Map(progress.map((p) => [p.lesson_id, p.completed_at]));
  } catch (error) {
    if (!isTrainingUnavailable(error)) throw error;
    return {
      available: false,
      lessons: [],
      total: 0,
      finished: 0,
      complete: false,
      required: settings.required_for_csms,
      exempt,
      blocked: false,
      preview,
    };
  }

  let earlierAllFinished = true;
  const views: LessonView[] = lessons.map((lesson, index) => {
    const finished = finishedAt.get(lesson.id) || null;
    const locked = !preview && !finished && !earlierAllFinished;
    if (!finished) earlierAllFinished = false;
    return {
      id: lesson.id,
      number: index + 1,
      title: lesson.title,
      description: lesson.description || null,
      video_url: locked ? null : lesson.video_url,
      finished_at: finished,
      locked,
    };
  });

  const finished = views.filter((l) => l.finished_at).length;
  const complete = views.length > 0 && finished === views.length;
  return {
    available: true,
    lessons: views,
    total: views.length,
    finished,
    complete,
    required: settings.required_for_csms,
    exempt,
    blocked: !preview && settings.required_for_csms && !exempt && finished < views.length,
    preview,
  };
}

/**
 * Marks a lesson finished for one person. It must be the next unlocked lesson; a lesson that
 * is already finished stays finished (same date) and reports `created: false`.
 */
export async function finishLesson(
  userId: string,
  lessonId: string,
  options: { preview?: boolean } = {}
): Promise<{ lesson: TrainingLesson; completedAt: string; created: boolean }> {
  const [lessons, progress] = await Promise.all([
    trainingRepository.listLessons({ activeOnly: true }),
    trainingRepository.listProgressForUser(userId),
  ]);
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) throw new NotFoundError('Lesson');
  const lesson = lessons[index];

  const done = new Map(progress.map((p) => [p.lesson_id, p.completed_at]));
  const already = done.get(lesson.id);
  if (already) return { lesson, completedAt: already, created: false };

  if (!options.preview && lessons.slice(0, index).some((earlier) => !done.has(earlier.id))) {
    throw new AppError('Finish the previous lesson first.', 409, 'LESSON_LOCKED');
  }

  const saved = await trainingRepository.markFinished(lesson.id, userId);
  return { lesson, completedAt: saved.progress.completed_at, created: saved.created };
}

/**
 * Whether a CSM is stopped from opening clients: the setting is on, they are not exempt, and at
 * least one active lesson is unfinished. With the setting off this is one settings read and
 * nothing else. If the training tables do not exist yet, nobody is stopped.
 */
export async function isCsmTrainingBlocked(userId: string): Promise<boolean> {
  const settings = await getTrainingSettings();
  if (!settings.required_for_csms || settings.exempt_user_ids.includes(userId)) return false;
  try {
    const [lessons, progress] = await Promise.all([
      trainingRepository.listLessons({ activeOnly: true }),
      trainingRepository.listProgressForUser(userId),
    ]);
    const done = new Set(progress.map((p) => p.lesson_id));
    return lessons.some((lesson) => !done.has(lesson.id));
  } catch (error) {
    if (isTrainingUnavailable(error)) return false;
    throw error;
  }
}
