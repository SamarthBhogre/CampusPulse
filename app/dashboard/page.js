'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, MapPin, ArrowRight, CalendarPlus } from 'lucide-react';
import { format } from 'date-fns';

function DashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!p) { setLoading(false); return; }
      setProfile(p);
      if (p.role === 'organizer') {
        router.replace('/dashboard/organizer');
        return;
      }
      // Student: my volunteered events
      const { data: signups } = await supabase
        .from('volunteer_signups')
        .select('id, signed_up_at, tasks(title), events(id, title, starts_at, location, cover_image, clubs(name))')
        .eq('profile_id', user.id)
        .order('signed_up_at', { ascending: false });
      setItems(signups || []);
      setLoading(false);
    })();
  }, [supabase, router]);

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="container py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Hi {profile?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="text-muted-foreground mt-1">Your volunteered events</p>
        </div>
        <Link href="/events"><Button variant="outline" className="gap-2">Browse events <ArrowRight className="w-4 h-4" /></Button></Link>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <CalendarPlus className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">You haven’t volunteered yet.</p>
            <p className="text-sm text-muted-foreground mb-4">Find an event that speaks to you.</p>
            <Link href="/events"><Button>Explore events</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((it) => (
            <Link key={it.id} href={`/events/${it.events?.id}`}>
              <Card className="hover:shadow-md transition">
                <CardContent className="p-5 flex gap-4">
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
