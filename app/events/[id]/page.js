'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, Clock3, MapPin, Users, ArrowLeft, CheckCircle2, Heart, Lock, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import ErrorState from '@/components/error-state';
import EmptyState from '@/components/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function EventDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [signups, setSignups] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      const { data: ev, error: eventError } = await supabase
        .from('events')
        .select('id, club_id, title, description, location, starts_at, ends_at, cover_image, visibility, created_by, status, clubs(name)')
        .eq('id', id)
        .maybeSingle();
      if (eventError) throw eventError;
      if (ev?.created_by) {
        const { data: organizer, error: organizerError } = await supabase
          .from('public_profiles')
          .select('full_name')
          .eq('id', ev.created_by)
          .maybeSingle();
        if (organizerError) throw organizerError;
        ev.profiles = organizer;
      }
      setEvent(ev);
      const { data: ts, error: tasksError } = await supabase
        .from('tasks')
        .select('id, event_id, title, description, volunteers_needed, created_at')
        .eq('event_id', id)
        .order('created_at');
      if (tasksError) throw tasksError;
      setTasks(ts || []);
      const [{ data: taskSummary, error: taskSummaryError }, { data: rsvpSummary, error: rsvpSummaryError }] = await Promise.all([
        supabase.rpc('get_event_task_summary', { p_event_id: id }),
        supabase.rpc('get_event_rsvp_summary', { p_event_id: id }),
      ]);
      if (taskSummaryError) throw taskSummaryError;
      if (rsvpSummaryError) throw rsvpSummaryError;
      setSignups((taskSummary || []).map((summary) => ({
        task_id: summary.task_id,
        id: summary.my_signup_id,
        signup_count: Number(summary.signup_count || 0),
        profile_id: currentUser?.id,
      })));
      setRsvps([{ id: rsvpSummary?.[0]?.my_rsvp_id || null, count: Number(rsvpSummary?.[0]?.rsvp_count || 0), profile_id: currentUser?.id }]);
    } catch (err) {
      console.error('Event detail load failed', err);
      setLoadError('We could not load this event. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  const rsvpSummary = rsvps[0];
  const myRsvp = user && rsvpSummary?.id ? rsvpSummary : null;

  async function toggleRsvp() {
    if (!user) { toast.error('Please sign in to RSVP'); router.push('/auth/sign-in'); return; }
    setRsvpBusy(true);
    try {
      const res = await fetch(`/api/events/${id}/rsvp`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not update your RSVP');
      if (body.result?.action === 'removed') {
        toast.success('RSVP removed');
      } else {
        toast.success("You're attending! 🎉");
      }
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not update your RSVP right now.');
    } finally {
      setRsvpBusy(false);
    }
  }

  async function volunteer(taskId) {
    if (!user) { toast.error('Please sign in to volunteer'); router.push('/auth/sign-in'); return; }
    setActionId(taskId);
    try {
      const res = await fetch(`/api/events/${id}/volunteer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not sign up for this task');
      toast.success("You're signed up!");
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not sign up for this task right now.');
    } finally {
      setActionId(null);
    }
  }

  async function withdraw(signupId, taskId) {
    setActionId(signupId);
    try {
      const res = await fetch(`/api/events/${id}/volunteer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not withdraw');
      toast.success('Withdrawn from task');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not withdraw from this task right now.');
    } finally {
      setActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="container max-w-4xl py-8 animate-in-fade">
        <Skeleton className="mb-6 aspect-[21/9] w-full rounded-2xl" />
        <Skeleton className="h-8 w-2/3 mb-3" />
        <Skeleton className="h-5 w-1/3 mb-8" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return <div className="container max-w-2xl py-16"><ErrorState description={loadError} onRetry={load} /></div>;
  }

  if (!event) {
    return (
      <div className="container max-w-2xl py-16">
        <EmptyState
          icon={Calendar}
          title="Event not found"
          description="This event may have been removed or is no longer available."
          action={<Link href="/events"><Button variant="outline">Back to events</Button></Link>}
        />
      </div>
    );
  }

  if (event.status === 'hidden') {
    return (
      <div className="container max-w-2xl py-16">
        <EmptyState
          icon={Calendar}
          title="Event not available"
          description="This event is not currently available."
          action={<Link href="/events"><Button variant="outline">Back to events</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 sm:py-8 animate-in-up">
      <Link href="/events" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to events
      </Link>

      {event.cover_image && (
        <img
          src={event.cover_image}
          alt={`Cover image for ${event.title}`}
          className="mb-6 aspect-[21/9] w-full rounded-2xl object-cover shadow-sm"
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {event.clubs?.name && <Badge variant="secondary">{event.clubs.name}</Badge>}
        {event.status === 'cancelled' && (
          <Badge variant="destructive" className="text-sm font-semibold">Cancelled</Badge>
        )}
        {event.visibility === 'club_only' && (
          <Badge variant="default" className="gap-1"><Lock className="h-3 w-3" /> Members only</Badge>
        )}
        <span className="text-sm text-muted-foreground">
          Organized by {event.profiles?.full_name || 'Campus Pulse'}
        </span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>

      <div className="my-5 flex flex-wrap gap-x-5 gap-y-2.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
          {format(new Date(event.starts_at), 'PPP')}
        </span>
        <span className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
          {format(new Date(event.starts_at), 'p')}
        </span>
        {event.location && (
          <span className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            {event.location}
          </span>
        )}
        <span className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" aria-hidden="true" />
          {rsvpSummary?.count || 0} attending
        </span>
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Button onClick={toggleRsvp} disabled={rsvpBusy || event.status === 'cancelled'} variant={myRsvp ? 'secondary' : 'default'} size="lg" className="gap-2">
          <Heart className={cn('h-4 w-4', myRsvp && 'fill-current')} aria-hidden="true" />
          {rsvpBusy ? 'Saving…' : myRsvp ? "You're attending" : "I'll be there"}
        </Button>
        <a href={`/api/events/${id}/calendar`} download={`event-${id}.ics`}>
          <Button variant="outline" size="lg" className="gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Add to calendar
          </Button>
        </a>
        {tasks.length > 0 && (
          <a href="#tasks">
            <Button variant="outline" size="lg">See volunteer tasks</Button>
          </a>
        )}
      </div>

      {event.description && (
        <p className="max-w-3xl whitespace-pre-line text-base leading-8 text-muted-foreground">
          {event.description}
        </p>
      )}

      <div className="mt-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Get involved</p>
            <h2 id="tasks" className="mt-1.5 text-2xl font-bold tracking-tight">Volunteer tasks</h2>
          </div>
          {tasks.length > 0 && (
            <span className="text-sm text-muted-foreground">{tasks.length} option{tasks.length === 1 ? '' : 's'}</span>
          )}
        </div>

        {tasks.length === 0 ? (
          <EmptyState icon={Users} title="No volunteer tasks yet" description="The organizer has not posted volunteer opportunities for this event yet." />
        ) : (
          <div className="space-y-3 animate-stagger">
            {tasks.map((task) => {
              const summary = signups.find((s) => s.task_id === task.id);
              const filled = summary?.signup_count || 0;
              const mySignup = summary?.id ? summary : null;
              const isFull = filled >= task.volunteers_needed;
              const pct = task.volunteers_needed > 0 ? Math.min(100, Math.round(filled / task.volunteers_needed * 100)) : 0;

              return (
                <div key={task.id} className={cn('rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md', mySignup ? 'border-primary/30 bg-primary/[0.02]' : 'border-border/70')}>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold">{task.title}</h3>
                        {mySignup && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-label="You are signed up" />}
                      </div>
                      {task.description && <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{task.description}</p>}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden="true" />{filled} of {task.volunteers_needed} spots filled</span>
                          <span>{Math.max(0, task.volunteers_needed - filled)} open</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${filled} of ${task.volunteers_needed} volunteers`}>
                          <div className={cn('h-full rounded-full transition-all duration-500', isFull ? 'bg-muted-foreground' : 'bg-primary')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="sm:shrink-0">
                      {mySignup ? (
                        <Button variant="outline" size="sm" onClick={() => withdraw(mySignup.id, task.id)} disabled={actionId === mySignup.id || event.status === 'cancelled'}>
                          {actionId === mySignup.id ? 'Withdrawing…' : 'Withdraw'}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => volunteer(task.id)} disabled={isFull || actionId === task.id || event.status === 'cancelled'} variant={isFull ? 'secondary' : 'default'}>
                          {isFull ? 'Task full' : actionId === task.id ? 'Signing up…' : 'Volunteer'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}