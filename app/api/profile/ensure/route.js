import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .eq('id', user.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ profile: existing });
  }

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Profile is missing and server repair is not configured' }, { status: 503 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const fallbackName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Campus Pulse user';
  const { data: repaired, error: repairError } = await admin
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      full_name: fallbackName,
      role: 'student',
    }, { onConflict: 'id' })
    .select('id, email, full_name, role, created_at')
    .single();

  if (repairError) {
    return NextResponse.json({ error: repairError.message }, { status: 500 });
  }

  return NextResponse.json({ profile: repaired, repaired: true });
}
