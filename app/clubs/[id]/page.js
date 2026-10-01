'use client';

import { useEffect, useState, use, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Users, ArrowLeft, Check, Calendar, MapPin, Lock, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';

function ClubDetailPage({ params }) {
  const { id } = use(params);
  const supabase = getSupabaseBrowserClient();
  const [club, setClub] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [events, setEvents] = useState([]);
  const [user, setUser] = useState(null);
  const [myMembership, setMyMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);
      const { data: c } = await supabase
        .from('clubs').select('id, name, description, created_at').eq('id', id).maybeSingle();
      setClub(c);
      if (!c) return;

      const [{ data: m }, { data: counts, error: countsError }, { data: e }] = await Promise.all([
        currentUser
          ? supabase.from('club_members').select('id, profile_id, created_at')
              .eq('club_id', id).eq('profile_id', currentUser.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.rpc('get_club_member_counts'),
        supabase.from('events').select('id, title, description, starts_at, location, cover_image, visibility')
          .eq('club_id', id).order('starts_at'),
      ]);
      if (countsError) throw countsError;
      setMemberCount(Number((counts || []).find((row) => row.club_id === id)?.member_count || 0));
      setMyMembership(m || null);
      setEvents(e || []);
    } catch (err) {
      console.error('Club detail load failed', err);
      setLoadError('Could not load club details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  async function join() {
    if (!user) { toast.error('Sign in to join'); return; }
    setBusy(true);
    const { error } = await supabase.from('club_members').insert({ club_id: id, profile_id: user.id });
    if (error) toast.error('Could not join this club right now.');
    else { toast.success('Joined!'); await load(); }
    setBusy(false);
  }

  async function leave() {
    if (!myMembership) return;
    setBusy(true);
    const { error } = await supabase.from('club_members').delete().eq('id', myMembership.id);
    if (error) toast.error('Could not leave club right now.');
    else { toast.success('Left club'); await load(); }
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container max-w-2xl py-16">
        <ErrorState description={loadError} onRetry={load} />
      </div>
    );
  }

  if (!club) {
    return <div className="container py-16 text-center text-muted-foreground">Club not found.</div>;
  }

  return (
    <div className="container py-8 max-w-4xl animate-in-up">
      <Link href="/clubs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All clubs
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{club.name}</h1>
          <p className="text-muted-foreground">{club.description}</p>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-4 h-4" aria-hidden="true" /> {memberCount} members</span>
            <span>{events.length} events</span>
          </div>
        </div>
        {user && (myMembership ? (
          <Button variant="outline" onClick={leave} disabled={busy} className="gap-2">
            <Check className="w-4 h-4" aria-hidden="true" /> {busy ? '…' : 'Leave club'}
          </Button>
        ) : (
          <Button onClick={join} disabled={busy} className="gap-2">
            {busy ? '…' : 'Join club'}
          </Button>
        ))}
      </div>

      <h2 className="text-xl font-semibold mb-4">Events</h2>
      {events.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No events from this club yet.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {events.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}`}>
              <Card className="hover:shadow-md transition h-full">
                <div className="aspect-video bg-gradient-to-br from-primary/20 to-purple-500/20 relative overflow-hidden">
                  {ev.cover_image && (
                    <img src={ev.cover_image} alt={`Cover for ${ev.title}`} className="w-full h-full object-cover" />
                  )}
                  <Badge className="absolute top-2 right-2 gap-1" variant={ev.visibility === 'club_only' ? 'default' : 'secondary'}>
                    {ev.visibility === 'club_only' ? <><Lock className="w-3 h-3" aria-hidden="true" /> Club only</> : <><Globe className="w-3 h-3" aria-hidden="true" /> Public</>}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold line-clamp-1">{ev.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" aria-hidden="true" />{format(new Date(ev.starts_at), 'MMM d')}</span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden="true" />{ev.location}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4">Membership</h2>
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        {user ? (myMembership ? 'You are a member of this club.' : 'Join this club to access member-only events.') : 'Sign in to join this club.'}
        <span className="block mt-2">Member contact details are private.</span>
      </CardContent></Card>
    </div>
  );
}

export default ClubDetailPage;
