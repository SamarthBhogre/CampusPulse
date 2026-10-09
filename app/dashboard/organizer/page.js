'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureCurrentProfile } from '@/lib/profile';
import { Plus, Calendar, MapPin, Users, Trash2, Edit, Heart, CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import PageHeader from '@/components/page-header';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export default function OrganizerDashboard() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/sign-in'); return; }
      const profile = await ensureCurrentProfile();
      if (profile.role !== 'organizer') { router.replace('/dashboard'); return; }
      const { data: ev, error: eventsError } = await supabase
        .from('events')
        .select('id, title, description, location, starts_at, cover_image, visibility, max_attendees, clubs(name), tasks(count), volunteer_signups(count), event_rsvps(count)')
        .eq('created_by', user.id)
        .order('starts_at')
        .limit(100);
      if (eventsError) throw eventsError;
      setEvents((ev || []).map((event) => ({
        ...event,
        task_count: event.tasks?.[0]?.count || 0,
        volunteer_count: event.volunteer_signups?.[0]?.count || 0,
        rsvp_count: event.event_rsvps?.[0]?.count || 0,
      })));
    } catch (err) {
      console.error('Organizer dashboard load failed', err);
      setError('We could not load your organizer workspace right now.');
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  async function deleteEvent(id) {
    setDeletingId(id);
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) toast.error('Could not delete this event.');
    else { toast.success('Event deleted'); load(); }
    setDeletingId(null);
  }

  if (loading) {
    return (
      <div className="container space-y-5 py-8 animate-in-fade">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-2xl py-16">
        <ErrorState title="Organizer dashboard could not load" description={error} onRetry={load} />
      </div>
    );
  }

  const totalVolunteers = events.reduce((s, e) => s + e.volunteer_count, 0);
  const totalRsvps = events.reduce((s, e) => s + e.rsvp_count, 0);

  return (
    <div className="container py-8 sm:py-10 animate-in-up">
      <PageHeader
        eyebrow="Organizer workspace"
        title="Your events"
        description="Create, manage, and grow the campus experiences you lead."
        action={
          <Link href="/dashboard/organizer/events/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Create event
            </Button>
          </Link>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total events" value={events.length} />
        <StatCard label="Total volunteers" value={totalVolunteers} />
        <StatCard label="Total RSVPs" value={totalRsvps} />
      </div>

      <div className="mt-10">
        {events.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No events yet"
            description="Create your first event to start building a campus community around it."
            action={<Link href="/dashboard/organizer/events/new"><Button>Create your first event</Button></Link>}
          />
        ) : (
          <div className="space-y-4 animate-stagger">
            {events.map((ev) => (
              <div key={ev.id} className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
                <div className="flex flex-col gap-0 sm:flex-row">
                  <div className="h-44 w-full shrink-0 bg-muted sm:h-auto sm:w-40">
                    {ev.cover_image ? (
                      <img src={ev.cover_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/20 min-h-[100px]">
                        <CalendarRange className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row">
                    <div className="flex-1 min-w-0">
                      {ev.clubs?.name && <Badge variant="secondary" className="mb-2 text-[10px]">{ev.clubs.name}</Badge>}
                      <h2 className="font-semibold tracking-tight">{ev.title}</h2>
                      {ev.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{ev.description}</p>}
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{format(new Date(ev.starts_at), 'MMM d, yyyy h:mm a')}</span>
                        {ev.location && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>}
                        <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{ev.volunteer_count} volunteers</span>
                        <span className="flex items-center gap-1.5"><Heart className="h-3.5 w-3.5 text-rose-500" />{ev.max_attendees != null ? `${ev.rsvp_count} / ${ev.max_attendees}` : ev.rsvp_count} attending</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:flex-col sm:justify-center">
                      <Link href={"/dashboard/organizer/events/" + ev.id} className="flex-1 sm:flex-none">
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <Edit className="h-3.5 w-3.5" /> Manage
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive hover:border-destructive/30 flex-1 sm:flex-none">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the event and all its tasks and volunteer signups. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteEvent(ev.id)}
                              disabled={deletingId === ev.id}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deletingId === ev.id ? 'Deleting...' : 'Delete event'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}