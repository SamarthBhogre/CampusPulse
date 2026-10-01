'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureCurrentProfile } from '@/lib/profile';
import { Calendar, MapPin, ArrowRight, Heart, ClipboardList, CalendarRange } from 'lucide-react';
import { format } from 'date-fns';
import PageHeader from '@/components/page-header';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function StatCard({ icon: Icon, label, value, sublabel, colorClass }) {
  return (
    <div className={`rounded-xl border p-5 ${colorClass}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function EventListItem({ event, task }) {
  return (
    <Link href={`/events/${event?.id}`} className="group block rounded-lg border border-border/70 bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
          {event?.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.cover_image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground/30">
              <Calendar className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {event?.clubs?.name && (
            <Badge variant="secondary" className="mb-1 text-[10px]">{event.clubs.name}</Badge>
          )}
          <h3 className="font-semibold leading-snug line-clamp-1 group-hover:text-primary transition-colors">{event?.title}</h3>
          {task && <p className="text-xs text-muted-foreground mt-0.5">Task: {task.title}</p>}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            {event?.starts_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(event.starts_at), 'MMM d, yyyy')}
              </span>
            )}
            {event?.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [volunteering, setVolunteering] = useState([]);
  const [attending, setAttending] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/sign-in'); return; }
        const p = await ensureCurrentProfile();
        if (cancelled) return;
        setProfile(p);
        if (p.role === 'organizer') { router.replace('/dashboard/organizer'); return; }
        const [{ data: signups }, { data: rsvps }] = await Promise.all([
          supabase
            .from('volunteer_signups')
            .select('id, signed_up_at, tasks(title), events(id, title, starts_at, location, cover_image, clubs(name))')
            .eq('profile_id', user.id)
            .order('signed_up_at', { ascending: false })
            .limit(50),
          supabase
            .from('event_rsvps')
            .select('id, created_at, events(id, title, starts_at, location, cover_image, clubs(name))')
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (!cancelled) {
          setVolunteering(signups || []);
          setAttending(rsvps || []);
        }
      } catch (err) {
        console.error('Student dashboard load failed', err);
        if (!cancelled) setError('We could not load your activity right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="container py-8 space-y-6 animate-in-fade">
        <Skeleton className="h-20 w-2/3" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-5 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container max-w-2xl py-16">
        <ErrorState title="Dashboard could not load" description={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const volunteeringEventIds = new Set(volunteering.map((v) => v.events?.id));
  const attendingOnly = attending.filter((a) => !volunteeringEventIds.has(a.events?.id));
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="container py-8 sm:py-10 animate-in-up">
      <PageHeader
        eyebrow="Your campus"
        title={`Hi ${firstName} 👋`}
        description="Track events and communities you care about."
        action={
          <Link href="/events">
            <Button className="gap-2">
              Browse events <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={ClipboardList}
          label="Volunteering"
          value={volunteering.length}
          sublabel="Tasks you have signed up for"
          colorClass="border-primary/20 bg-primary/[0.03]"
        />
        <StatCard
          icon={Heart}
          label="Attending"
          value={attending.length}
          sublabel="RSVPs on your calendar"
          colorClass="border-rose-500/20 bg-rose-500/[0.03]"
        />
      </div>

      {/* Volunteering */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Volunteering</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{volunteering.length}</span>
        </div>
        {volunteering.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No volunteer tasks yet"
            description="Find an event and sign up to help out."
            action={<Link href="/events"><Button size="sm">Explore events</Button></Link>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 animate-stagger">
            {volunteering.map((it) => (
              <EventListItem key={it.id} event={it.events} task={it.tasks} />
            ))}
          </div>
        )}
      </section>

      {/* Attending */}
      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-rose-500" />
          <h2 className="font-semibold">Attending</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{attendingOnly.length}</span>
        </div>
        {attendingOnly.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Your calendar is open"
            description="RSVP to events you want to attend and they will appear here."
            action={<Link href="/events"><Button variant="outline" size="sm">Browse events</Button></Link>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 animate-stagger">
            {attendingOnly.map((it) => (
              <EventListItem key={it.id} event={it.events} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
