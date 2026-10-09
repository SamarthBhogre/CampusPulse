import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/settings/delete-account
 * Permanently deletes the authenticated user through Supabase Auth. The
 * profile and account-owned records then follow the database foreign-key
 * cascade. Auth deletion is intentionally performed before any local cleanup
 * so a failed deletion cannot leave a partially anonymized account.
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
    if (body.permanent === true) {
      const { data: profile } = await admin.from('profiles').select('organizer_request_status, role').eq('id', user.id).maybeSingle();
      if (!profile || (profile.organizer_request_status !== 'rejected' && profile.role !== 'student')) {
        return NextResponse.json({ error: 'Permanent deletion is only available for rejected organizer applications.' }, { status: 403 });
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
      if (deleteError) throw deleteError;
      logger.info('Rejected applicant permanently deleted', { userId: user.id });
      return NextResponse.json({ ok: true, permanent: true });
    }

    // Delete Auth first. The profiles foreign key cascades the account data;
    // do not mutate the profile before this succeeds.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;

    logger.info('Account self-deleted', { userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('Account deletion failed', err, { userId: user.id });
    return NextResponse.json({ error: 'Could not delete account. Please contact support.' }, { status: 500 });
  }
}
