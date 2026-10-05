import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.admin
    .from('profiles')
    .select('id, email, full_name, role, organizer_request_status, organizer_requested_at, organizer_rejection_reason, organizer_org_name, organizer_org_type, organizer_org_website, organizer_org_description, organizer_experience, created_at')
    .in('organizer_request_status', ['pending', 'approved', 'rejected'])
    .order('organizer_requested_at', { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    console.error('Organizer request list failed', error);
    return NextResponse.json({ error: 'Could not load organizer requests' }, { status: 500 });
  }

  return NextResponse.json({ requests: data || [] });
}
