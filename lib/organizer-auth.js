import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function requireOrganizer() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: 'Not authenticated', status: 401 };

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, is_suspended')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Organizer authorization lookup failed', profileError);
    return { error: 'Could not verify organizer access', status: 500 };
  }
  if (profile?.is_suspended === true) {
    return { error: 'Account suspended', status: 403 };
  }
  if (profile?.role !== 'organizer') return { error: 'Organizer access required', status: 403 };
  return { user, admin };
}
