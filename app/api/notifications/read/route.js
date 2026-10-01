import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** POST /api/notifications/read — mark notifications as read
 *  Body: { ids: string[] } or {} to mark all
 */
export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();

  let query = supabase
    .from('notification_queue')
    .update({ read_at: now })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    query = query.in('id', body.ids);
  }

  const { error } = await query;
  if (error) {
    logger.error('Notifications mark-read failed', error);
    return NextResponse.json({ error: 'Could not mark as read' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
