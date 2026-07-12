import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action;

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const payload = action === 'approve'
    ? { role: 'organizer', organizer_request_status: 'approved' }
    : { role: 'student', organizer_request_status: 'rejected' };

  const { data, error } = await auth.admin
    .from('profiles')
    .update(payload)
    .eq('id', id)
    .select('id, email, full_name, role, organizer_request_status, organizer_requested_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
