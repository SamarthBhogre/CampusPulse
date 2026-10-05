import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data, error } = await supabase.from('profiles').select('id, email, full_name, role, organizer_request_status, organizer_requested_at, organizer_rejection_reason, organizer_org_name, organizer_org_type, organizer_org_website, organizer_org_description, organizer_experience').eq('id', user.id).single();
  if (error) return NextResponse.json({ error: 'Could not load organizer application' }, { status: 500 });
  return NextResponse.json({ profile: data });
}
