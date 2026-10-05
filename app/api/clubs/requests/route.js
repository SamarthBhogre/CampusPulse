import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('club_creation_requests')
    .select('id, name, description, status, rejection_reason, created_club_id, created_at, reviewed_at')
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Could not load your club requests' }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data, error } = await supabase.rpc('create_club_request', {
    p_name: body.name,
    p_description: body.description,
  });
  if (error) return NextResponse.json({ error: error.message || 'Could not submit club request' }, { status: 400 });
  return NextResponse.json({ request: data }, { status: 201 });
}
