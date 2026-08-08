import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

function parseDate(value, fieldName) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return date.toISOString();
}

export async function POST(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (profile?.role !== 'organizer') {
    return NextResponse.json({ error: 'Organizer access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const payload = {
      title: String(body.title || '').trim(),
      description: body.description || null,
      location: body.location || null,
      starts_at: parseDate(body.starts_at, 'starts_at'),
      ends_at: body.ends_at ? parseDate(body.ends_at, 'ends_at') : null,
      cover_image: body.cover_image || null,
      club_id: body.club_id || null,
      visibility: body.visibility === 'club_only' ? 'club_only' : 'public',
      created_by: user.id,
    };

    if (!payload.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (!payload.starts_at) {
      return NextResponse.json({ error: 'Starts_at is required' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('events')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || 'Could not create event' }, { status: 400 });
  }
}