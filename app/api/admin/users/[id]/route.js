import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-auth';
import { logger } from '@/lib/logger';

export async function PATCH(request, { params }) {
  const auth = await requireAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  const allowedActions = ['suspend', 'restore', 'remove_organizer'];
  if (!allowedActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    // Prevent admins from suspending themselves
    if (id === auth.user.id) {
      return NextResponse.json({ error: 'Cannot modify your own account this way' }, { status: 400 });
    }

    const { data: target, error: fetchErr } = await auth.admin
      .from('profiles').select('id, role, is_suspended').eq('id', id).maybeSingle();
    if (fetchErr || !target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let update = {};
    let auditAction = action;
    if (action === 'suspend') update = { is_suspended: true };
    else if (action === 'restore') update = { is_suspended: false };
    else if (action === 'remove_organizer') update = { role: 'student', organizer_request_status: 'rejected' };

    const { data, error } = await auth.admin
      .from('profiles').update(update).eq('id', id)
      .select('id, email, full_name, role, is_suspended').single();
    if (error) throw error;

    // Write audit log
    await auth.admin.rpc('write_audit_log', {
      p_action: `user_${auditAction}`,
      p_target_type: 'profile',
      p_target_id: id,
      p_previous: { role: target.role, is_suspended: target.is_suspended },
      p_new: update,
    }).catch(() => {});

    return NextResponse.json({ user: data });
  } catch (err) {
    logger.error('Admin user update failed', err, { targetId: id, action });
    return NextResponse.json({ error: 'Could not update user' }, { status: 500 });
  }
}
