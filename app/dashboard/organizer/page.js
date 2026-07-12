'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureCurrentProfile } from '@/lib/profile';
import { Plus, Calendar, MapPin, Users, Trash2, Edit, Heart } from 'lucide-react';
import { format } from 'date-fns';

function countBy(items, key) {
  return (items || []).reduce((acc, item) => {
    const value = item[key];
    if (value) acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function OrganizerDashboard() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/sign-in');
        return;
      }

      const profile = await ensureCurrentProfile();
      if (profile.role !== 'organizer') {
        router.replace('/dashboard');
        return;
      }

      const { data: ev, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, location, starts_at, cover_image, visibility, clubs(name)')
        .eq('created_by', user.id)
        .order('starts_at')
        .limit(100);
      if (eventsError) throw eventsError;

      const eventIds = (ev || []).map((e) => e.id);
      let taskCounts = {};
      let volunteerCounts = {};
      let rsvpCounts = {};

      if (eventIds.length) {
        const [{ data: tasks }, { data: signups }, { data: rsvps }] = await Promise.all([
          supabase.from('tasks').select('event_id').in('event_id', eventIds),
          supabase.from('volunteer_signups').select('event_id').in('event_id', eventIds),
          supabase.from('event_rsvps').select('event_id').in('event_id', eventIds),
        ]);

        taskCounts = countBy(tasks, 'event_id');
        volunteerCounts = countBy(signups, 'event_id');
        rsvpCounts = countBy(rsvps, 'event_id');
      }

      setEvents((ev || []).map((event) => ({
        ...event,
        task_count: taskCounts[event.id] || 0,
        volunteer_count: volunteerCounts[event.id] || 0,
        rsvp_count: rsvpCounts[event.id] || 0,
      })));
    } catch (err) {
      console.error('Organizer dashboard load failed', err);
      setError(err?.message || 'Failed to load dashboard');
      toast.error(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteEvent(id) {
    if (!confirm('Delete this event and all its tasks/volunteers?')) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Event deleted'); load(); }
  }

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading...</div>;
  if (error) {
    return (
      <div className="container py-16 max-w-lg text-center">
        <h1 className="text-2xl font-bold mb-2">Organizer dashboard could not load</h1>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Organizer Dashboard</h1>
          <p className="text-muted-foreground mt-1">Your events and volunteers</p>
        </div>
        <Link href="/dashboard/organizer/events/new">
          <Button className="gap-2"><Plus className="w-4 h-4" /> Create event</Button>
        </Link>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="font-medium mb-1">No events yet.</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first event to start recruiting volunteers.</p>
            <Link href="/dashboard/organizer/events/new"><Button>Create your first event</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {events.map((ev) => (
            <Card key={ev.id}>
              <CardContent className="p-5 flex flex-col md:flex-row gap-4">
                <div className="w-full md:w-40 h-32 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  {ev.cover_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.cover_image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {ev.clubs?.name && <Badge variant="secondary" className="mb-2">{ev.clubs.name}</Badge>}
                  <h3 className="font-semibold text-lg">{ev.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{ev.description}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {format(new Date(ev.starts_at), 'MMM d, yyyy - h:mm a')}</span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {ev.location}</span>}
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {ev.volunteer_count} volunteers - {ev.task_count} tasks</span>
                    <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5 fill-current text-rose-500" /> {ev.rsvp_count} attending</span>
                  </div>
                </div>
                <div className="flex md:flex-col gap-2">
                  <Link href={`/dashboard/organizer/events/${ev.id}`}><Button variant="outline" size="sm" className="gap-1 w-full"><Edit className="w-3.5 h-3.5" /> Manage</Button></Link>
                  <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => deleteEvent(ev.id)}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrganizerDashboard;
