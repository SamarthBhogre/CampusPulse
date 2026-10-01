import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';
import { enqueueNotification, NOTIFICATION_TYPES } from '@/lib/notifications';

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

  // Fetch existing state for audit trail
  const { data: prevProfile } = await auth.admin
    .from('profiles')
    .select('role, organizer_request_status')
    .eq('id', id)
    .maybeSingle();

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
    logger.error('Organizer request update failed', error, { targetId: id, action });
    return NextResponse.json({ error: 'Could not update organizer request' }, { status: 500 });
  }

  // Write audit log (non-blocking)
  auth.admin.rpc('write_audit_log', {
    p_action: action === 'approve' ? 'organizer_approved' : 'organizer_rejected',
    p_target_type: 'profile',
    p_target_id: id,
    p_previous: prevProfile ? { role: prevProfile.role, organizer_request_status: prevProfile.organizer_request_status } : null,
    p_new: payload,
    p_metadata: { email: data.email, full_name: data.full_name },
  }).catch(() => {});

  // Enqueue notification to the applicant (non-blocking)
  enqueueNotification(
    id,
    action === 'approve' ? NOTIFICATION_TYPES.ORGANIZER_APPROVED : NOTIFICATION_TYPES.ORGANIZER_REJECTED,
    { full_name: data.full_name, email: data.email }
  );

  return NextResponse.json({ profile: data });
}
