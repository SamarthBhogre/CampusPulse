import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** GET /api/notifications — get user's notifications */
export async function GET(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const pageSize = 20;

  const { data, count, error } = await supabase
    .from('notification_queue')
    .select('*', { count: 'exact' })
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (error) {
    logger.error('Notifications GET failed', error);
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 });
  }

  const unreadCount = (data || []).filter(n => !n.read_at).length;

  return NextResponse.json({
    notifications: data || [],
    total: count || 0,
    unread: unreadCount,
    page,
    pageSize,
  });
}
