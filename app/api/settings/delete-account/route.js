import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/settings/delete-account
 * Soft-deletes the user: anonymizes profile, signs out, leaves institutional records.
 * Does NOT cascade-delete events/RSVPs/attendance to preserve institutional integrity.
 */
export async function DELETE(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== 'DELETE MY ACCOUNT') {
    return NextResponse.json({ error: 'Confirmation phrase required' }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  try {
    // 1. Anonymize profile — preserve ID for referential integrity
    await admin.from('profiles').update({
      full_name: '[Deleted User]',
      username: null,
      email: `deleted_${user.id}@deleted.invalid`,
      avatar_url: null,
      organizer_request_status: null,
      is_suspended: false,
    }).eq('id', user.id);

    // 2. Remove club memberships (these are personal, not institutional)
    await admin.from('club_members').delete().eq('profile_id', user.id);

    // 3. Remove notification queue entries for this user
    await admin.from('notification_queue').delete().eq('recipient_id', user.id);

    // 4. Remove notification preferences
    await admin.from('notification_preferences').delete().eq('profile_id', user.id);

    // 5. Write audit log entry
    await admin.rpc('write_audit_log', {
      p_action: 'account_deleted',
      p_target_type: 'profile',
      p_target_id: user.id,
      p_metadata: { self_deleted: true },
    }).catch(() => {});

    // 6. Sign out via Supabase Auth admin — invalidate all sessions
    await admin.auth.admin.deleteUser(user.id);

    logger.info('Account self-deleted', { userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('Account deletion failed', err, { userId: user.id });
    return NextResponse.json({ error: 'Could not delete account. Please contact support.' }, { status: 500 });
  }
}
