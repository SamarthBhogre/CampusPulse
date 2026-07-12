import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'Not authenticated', status: 401 };
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return { error: profileError.message, status: 500 };
  }

  if (profile?.role !== 'admin') {
    return { error: 'Admin access required', status: 403 };
  }

  return { user, profile, admin };
}
