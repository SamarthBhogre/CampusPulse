import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/** GET /api/settings/notifications — get notification preferences */
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (error) {
    logger.error('Notification prefs GET failed', error);
    return NextResponse.json({ error: 'Could not load preferences' }, { status: 500 });
  }

  // Return defaults if no record yet
  const defaults = {
    profile_id: user.id,
    email_rsvp_confirmation: true,
    email_volunteer_confirmation: true,
    email_event_updates: true,
    email_reminders: true,
  };

  return NextResponse.json({ preferences: data || defaults });
}

/** PATCH /api/settings/notifications — update notification preferences */
export async function PATCH(request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const {
    email_rsvp_confirmation,
    email_volunteer_confirmation,
    email_event_updates,
    email_reminders,
  } = body;

  const updates = {};
  if (typeof email_rsvp_confirmation === 'boolean') updates.email_rsvp_confirmation = email_rsvp_confirmation;
  if (typeof email_volunteer_confirmation === 'boolean') updates.email_volunteer_confirmation = email_volunteer_confirmation;
  if (typeof email_event_updates === 'boolean') updates.email_event_updates = email_event_updates;
  if (typeof email_reminders === 'boolean') updates.email_reminders = email_reminders;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({ profile_id: user.id, ...updates, updated_at: new Date().toISOString() })
    .select()
    .single();

  if (error) {
    logger.error('Notification prefs PATCH failed', error);
    return NextResponse.json({ error: 'Could not update preferences' }, { status: 500 });
  }

  return NextResponse.json({ preferences: data });
}
