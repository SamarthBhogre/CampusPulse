import { logger } from '@/lib/logger';

const OWN_PROFILE_COLUMNS = 'id, full_name, username, avatar_url, email, role, created_at, organizer_request_status';

/** Reads the caller's own profile through their RLS-scoped client. */
export async function getOwnProfile(db, user) {
  const { data: profile, error } = await db
    .from('profiles')
    .select(OWN_PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    logger.error('Own profile lookup failed', error, { userId: user.id });
    return { error: 'Could not load profile', status: 500 };
  }
  if (!profile) return { error: 'Profile not found', status: 404 };
  return { profile: { ...profile, auth_email: user.email } };
}

/**
 * Updates the caller's display name and/or username via the update_own_profile
 * RPC, which validates input and only ever touches auth.uid()'s row. Role,
 * suspension, and email cannot be changed here.
 */
export async function updateOwnProfile(db, { full_name, username }) {
  if (full_name === undefined && username === undefined) {
    return { error: 'Nothing to update', status: 400 };
  }

  const { data, error } = await db.rpc('update_own_profile', {
    p_full_name: full_name !== undefined ? String(full_name).trim() : null,
    p_username: username !== undefined ? String(username).trim() : null,
    p_avatar_url: null,
  });

  if (error) {
    logger.error('Own profile update failed', error);
    // Return the DB validation message if it's user-facing
    const message = error.message?.includes('Username') || error.message?.includes('Display name')
      ? error.message
      : 'Could not update profile';
    return { error: message, status: 400 };
  }
  return { profile: data };
}
