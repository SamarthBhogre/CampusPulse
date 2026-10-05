import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await auth.admin
    .from('club_creation_requests')
    .select('id, requester_id, name, description, status, rejection_reason, created_club_id, created_at, reviewed_at, profiles!club_creation_requests_requester_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: 'Could not load club requests' }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(request) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  if (!body.id || !['approve', 'reject'].includes(body.action)) return NextResponse.json({ error: 'Invalid review request' }, { status: 400 });

  // Use the user's session client so public.is_admin() sees auth.uid().
  const sessionClient = await getSupabaseServerClient();
  const { data, error } = await sessionClient.rpc('review_club_request', {
    p_request_id: body.id,
    p_action: body.action,
    p_rejection_reason: body.rejection_reason || null,
  });
  if (error) return NextResponse.json({ error: error.message || 'Could not review club request' }, { status: 400 });
  return NextResponse.json({ request: data });
}
