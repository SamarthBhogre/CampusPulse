import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';
import { logger } from '@/lib/logger';

/**
 * POST /api/events/[id]/volunteer
 * Body: { taskId: string }
 * Toggles a volunteer signup for the authenticated user.
 * Enforces club membership and task capacity server-side via the volunteer_for_task RPC.
 */
export async function POST(request, { params }) {
  const { id: eventId } = await params;
  const supabase = await getSupabaseServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Please sign in to volunteer' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const taskId = body?.taskId;
  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('volunteer_for_task', {
    p_task_id: taskId,
    p_event_id: eventId,
  });

  if (error) {
    const userMsg = error.message?.includes('club member')
      ? 'You must be a club member to volunteer for this event.'
      : error.message?.includes('Task is full')
      ? 'This task is already full.'
      : error.message?.includes('Invalid task')
      ? 'Invalid task for this event.'
      : 'Could not update your volunteer signup right now. Please try again.';

    logger.error('Volunteer toggle failed', error, { userId: user.id, eventId, taskId });
    return NextResponse.json({ error: userMsg }, { status: 400 });
  }

  if (data?.action === 'added') {
    const admin = getSupabaseAdminClient();
    const [{ data: event }, { data: task }, { data: actor }] = await Promise.all([
      admin.from('events').select('title, created_by').eq('id', eventId).maybeSingle(),
      admin.from('tasks').select('title').eq('id', taskId).maybeSingle(),
      admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);
    if (event) {
      void enqueueNotification(user.id, NOTIFICATION_TYPES.VOLUNTEER_CONFIRMATION, { event_id: eventId, event_title: event.title, task_title: task?.title });
      if (event.created_by && event.created_by !== user.id) {
        void enqueueNotification(event.created_by, NOTIFICATION_TYPES.VOLUNTEER_RECEIVED, { event_id: eventId, event_title: event.title, task_title: task?.title, actor_name: actor?.full_name || 'A student' });
      }
    }
  }

  return NextResponse.json({ result: data });
}
