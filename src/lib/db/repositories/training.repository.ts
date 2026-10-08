import { randomUUID } from 'crypto';
import { getSupabaseServiceClient } from '../supabase-client';
import { getStore } from '../mock-db';
import { TrainingLesson, TrainingProgress } from '../schema';
import { AppError, DatabaseError } from '../../errors';
import { fetchAllRows } from '../paging';

/**
 * The training tables have not been created yet (migration 20261008000002 not run).
 * Callers turn this into "Training is not set up yet." and never lock a CSM out because of it.
 */
export class TrainingUnavailableError extends AppError {
  constructor() {
    super('The training tables do not exist yet.', 503, 'TRAINING_UNAVAILABLE');
  }
}

export function isTrainingUnavailable(error: unknown): error is TrainingUnavailableError {
  return error instanceof TrainingUnavailableError;
}

/** Postgres "undefined table" (42P01) or PostgREST "table not in the schema cache" (PGRST205). */
function isMissingTable(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    (message.includes('training_') && (message.includes('schema cache') || message.includes('does not exist')))
  );
}

function fail(action: string, error: any): never {
  if (isMissingTable(error)) throw new TrainingUnavailableError();
  throw new DatabaseError(`Failed to ${action}: ${error.message}`, error);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: string | null | undefined): string | null => (value && UUID.test(value) ? value : null);

/** The in-memory lists. A store without them stands for "the tables have not been created yet". */
function mockLessons(): TrainingLesson[] {
  const rows = getStore().trainingLessons;
  if (!Array.isArray(rows)) throw new TrainingUnavailableError();
  return rows;
}
function mockProgress(): TrainingProgress[] {
  const rows = getStore().trainingProgress;
  if (!Array.isArray(rows)) throw new TrainingUnavailableError();
  return rows;
}

const inOrder = (a: TrainingLesson, b: TrainingLesson) =>
  a.sort_order - b.sort_order || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export type NewTrainingLesson = Pick<TrainingLesson, 'title' | 'description' | 'video_url' | 'created_by'>;
export type TrainingLessonChanges = Partial<Pick<TrainingLesson, 'title' | 'description' | 'video_url' | 'is_active'>>;

export class TrainingRepository {
  /** Lessons in the order CSMs take them. Hidden lessons are included unless `activeOnly` is set. */
  async listLessons(options: { activeOnly?: boolean } = {}): Promise<TrainingLesson[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      let query = supabase.from('training_lessons').select('*');
      if (options.activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (error) fail('list training lessons', error);
      return (data || []) as TrainingLesson[];
    }
    return mockLessons()
      .filter((l) => !options.activeOnly || l.is_active)
      .sort(inOrder);
  }

  async findLesson(id: string): Promise<TrainingLesson | null> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(id)) return null;
      const { data, error } = await supabase.from('training_lessons').select('*').eq('id', id).maybeSingle();
      if (error) fail('fetch the training lesson', error);
      return (data as TrainingLesson) || null;
    }
    return mockLessons().find((l) => l.id === id) || null;
  }

  /** Adds a lesson at the end of the list. */
  async createLesson(lesson: NewTrainingLesson): Promise<TrainingLesson> {
    const existing = await this.listLessons();
    const now = new Date().toISOString();
    const record: TrainingLesson = {
      id: randomUUID(),
      title: lesson.title,
      description: lesson.description,
      video_url: lesson.video_url,
      sort_order: existing.reduce((max, l) => Math.max(max, l.sort_order), 0) + 1,
      is_active: true,
      created_at: now,
      updated_at: now,
      created_by: lesson.created_by,
    };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      // created_by is a foreign key: an id that is not a real user id is stored as "unknown".
      const { data, error } = await supabase
        .from('training_lessons')
        .insert({ ...record, created_by: uuidOrNull(record.created_by) })
        .select('*')
        .single();
      if (error) fail('save the training lesson', error);
      return data as TrainingLesson;
    }

    mockLessons().push(record);
    return record;
  }

  /** Returns null when the lesson does not exist. */
  async updateLesson(id: string, changes: TrainingLessonChanges): Promise<TrainingLesson | null> {
    const change = { ...changes, updated_at: new Date().toISOString() };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(id)) return null;
      const { data, error } = await supabase.from('training_lessons').update(change).eq('id', id).select('*').maybeSingle();
      if (error) fail('update the training lesson', error);
      return (data as TrainingLesson) || null;
    }

    const row = mockLessons().find((l) => l.id === id);
    if (!row) return null;
    Object.assign(row, change);
    return row;
  }

  /** Deletes a lesson and everyone's progress for it. Returns false when it did not exist. */
  async deleteLesson(id: string): Promise<boolean> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(id)) return false;
      // training_progress rows go with it (ON DELETE CASCADE).
      const { data, error } = await supabase.from('training_lessons').delete().eq('id', id).select('id');
      if (error) fail('delete the training lesson', error);
      return (data || []).length > 0;
    }

    const lessons = mockLessons();
    const index = lessons.findIndex((l) => l.id === id);
    if (index === -1) return false;
    lessons.splice(index, 1);
    const store = getStore();
    store.trainingProgress = mockProgress().filter((p) => p.lesson_id !== id);
    return true;
  }

  /** Saves a new order: the first id becomes lesson 1, and so on. Training has a handful of lessons. */
  async setLessonOrder(orderedIds: string[]): Promise<void> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const results = await Promise.all(
        orderedIds.map((id, index) => supabase.from('training_lessons').update({ sort_order: index + 1 }).eq('id', id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) fail('reorder the training lessons', failed.error);
      return;
    }

    const lessons = mockLessons();
    orderedIds.forEach((id, index) => {
      const row = lessons.find((l) => l.id === id);
      if (row) row.sort_order = index + 1;
    });
  }

  /** The lessons one person has finished. */
  async listProgressForUser(userId: string): Promise<TrainingProgress[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(userId)) return [];
      const { data, error } = await supabase.from('training_progress').select('*').eq('user_id', userId);
      if (error) fail('read training progress', error);
      return (data || []) as TrainingProgress[];
    }
    return mockProgress().filter((p) => p.user_id === userId);
  }

  /** Everyone's progress in one read, for the CSM Manager's progress table. */
  async listAllProgress(): Promise<TrainingProgress[]> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      return fetchAllRows<TrainingProgress>(
        (from, to) =>
          supabase
            .from('training_progress')
            .select('*', { count: 'exact' })
            .order('user_id', { ascending: true })
            .order('lesson_id', { ascending: true })
            .range(from, to),
        (error) => fail('read training progress', error),
        50000
      );
    }
    return [...mockProgress()];
  }

  /**
   * Records that a person finished a lesson. Finishing the same lesson again changes nothing:
   * the first date is kept. `created` says whether this call was the first time.
   */
  async markFinished(lessonId: string, userId: string): Promise<{ progress: TrainingProgress; created: boolean }> {
    const record: TrainingProgress = { lesson_id: lessonId, user_id: userId, completed_at: new Date().toISOString() };

    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { error } = await supabase.from('training_progress').insert(record);
      if (!error) return { progress: record, created: true };
      // 23505 = this person already finished this lesson.
      if ((error as any).code !== '23505') fail('save training progress', error);
      const { data, error: readError } = await supabase
        .from('training_progress')
        .select('*')
        .eq('lesson_id', lessonId)
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) fail('read training progress', readError);
      return { progress: (data as TrainingProgress) || record, created: false };
    }

    const rows = mockProgress();
    const existing = rows.find((p) => p.lesson_id === lessonId && p.user_id === userId);
    if (existing) return { progress: existing, created: false };
    rows.push(record);
    return { progress: record, created: true };
  }

  /** Clears everything one person has finished. Returns how many lessons were cleared. */
  async resetProgressForUser(userId: string): Promise<number> {
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      if (!UUID.test(userId)) return 0;
      const { data, error } = await supabase.from('training_progress').delete().eq('user_id', userId).select('lesson_id');
      if (error) fail('reset training progress', error);
      return (data || []).length;
    }

    const rows = mockProgress();
    const kept = rows.filter((p) => p.user_id !== userId);
    getStore().trainingProgress = kept;
    return rows.length - kept.length;
  }
}

export const trainingRepository = new TrainingRepository();
