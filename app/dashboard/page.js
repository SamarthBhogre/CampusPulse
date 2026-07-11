'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, MapPin, ArrowRight, CalendarPlus, Heart, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';

function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [volunteering, setVolunteering] = useState([]);
  const [attending, setAttending] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/auth/sign-in'); return; }
        const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (!p) { return; }
        setProfile(p);
        if (p.role === 'organizer') { router.replace('/dashboard/organizer'); return; }

        const [{ data: signups }, { data: rsvps }] = await Promise.all([
          supabase
            .from('volunteer_signups')
            .select('id, signed_up_at, tasks(title), events(id, title, starts_at, location, cover_image, clubs(name))')
            .eq('profile_id', user.id)
            .order('signed_up_at', { ascending: false }),
          supabase
            .from('event_rsvps')
            .select('id, created_at, events(id, title, starts_at, location, cover_image, clubs(name))')
            .eq('profile_id', user.id)
            .order('created_at', { ascending: false }),
        ]);
        setVolunteering(signups || []);
        setAttending(rsvps || []);
      } catch (err) {
        console.error('Student dashboard load failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase, router]);

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;

  const volunteeringEventIds = new Set(volunteering.map((v) => v.events?.id));
  const attendingOnly = attending.filter((a) => !volunteeringEventIds.has(a.events?.id));

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Hi {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="text-muted-foreground mt-1">Your upcoming campus activities</p>
        </div>
        <Link href="/events"><Button variant="outline" className="gap-2">Browse events <ArrowRight className="w-4 h-4" /></Button></Link>
      </div>

      {/* Volunteering */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4 text-primary" />
          <h2 className="text-xl font-semibold">Volunteering</h2>
          <Badge variant="secondary">{volunteering.length}</Badge>
        </div>
        {volunteering.length === 0 ? (
          <Card><CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">You haven’t signed up for any tasks yet.</p>
            <Link href="/events"><Button size="sm">Find something to volunteer for</Button></Link>
          </CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {volunteering.map((it) => (
              <Link key={it.id} href={`/events/${it.events?.id}`}>
                <Card className="hover:shadow-md transition"><CardContent className="p-5 flex gap-4">
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {it.events?.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.events.cover_image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {it.events?.clubs?.name && <Badge variant="secondary" className="mb-1">{it.events.clubs.name}</Badge>}
                    <h3 className="font-semibold line-clamp-1">{it.events?.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">Task: {it.tasks?.title}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {it.events?.starts_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(it.events.starts_at), 'MMM d')}</span>}
                      {it.events?.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{it.events.location}</span>}
                    </div>
                  </div>
                </CardContent></Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Attending (RSVP only, no volunteer signup) */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-primary fill-current" />
          <h2 className="text-xl font-semibold">Attending</h2>
          <Badge variant="secondary">{attendingOnly.length}</Badge>
        </div>
        {attendingOnly.length === 0 ? (
          <Card><CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Nothing on your calendar yet. Tap “I’ll be there” on an event to add it here.</p>
          </CardContent></Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {attendingOnly.map((it) => (
              <Link key={it.id} href={`/events/${it.events?.id}`}>
                <Card className="hover:shadow-md transition"><CardContent className="p-5 flex gap-4">
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {it.events?.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.events.cover_image} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {it.events?.clubs?.name && <Badge variant="secondary" className="mb-1">{it.events.clubs.name}</Badge>}
                    <h3 className="font-semibold line-clamp-1">{it.events?.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {it.events?.starts_at && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(it.events.starts_at), 'MMM d')}</span>}
                      {it.events?.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{it.events.location}</span>}
                    </div>
                  </div>
                </CardContent></Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
