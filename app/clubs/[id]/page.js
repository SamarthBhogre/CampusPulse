'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Users, ArrowLeft, Check, Calendar, MapPin, Lock, Globe } from 'lucide-react';
import { format } from 'date-fns';

function ClubDetailPage({ params }) {
  const { id } = use(params);
  const supabase = getSupabaseBrowserClient();
  const [club, setClub] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [user, setUser] = useState(null);
  const [myMembership, setMyMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const { data: c } = await supabase.from('clubs').select('*').eq('id', id).maybeSingle();
      setClub(c);
      const { data: m } = await supabase.from('club_members').select('id, profile_id, created_at, profiles(full_name, email)').eq('club_id', id).order('created_at');
      setMembers(m || []);
      const { data: e } = await supabase.from('events').select('id, title, description, starts_at, location, cover_image, visibility').eq('club_id', id).order('starts_at');
      setEvents(e || []);
      if (user) {
        const mine = (m || []).find((mm) => mm.profile_id === user.id);
        setMyMembership(mine || null);
      }
    } catch (err) {
      console.error('Club detail load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function join() {
    if (!user) { toast.error('Sign in to join'); return; }
    setBusy(true);
    const { error } = await supabase.from('club_members').insert({ club_id: id, profile_id: user.id });
    if (error) toast.error(error.message);
    else { toast.success('Joined!'); await load(); }
    setBusy(false);
  }

  async function leave() {
    if (!myMembership) return;
    setBusy(true);
    const { error } = await supabase.from('club_members').delete().eq('id', myMembership.id);
    if (error) toast.error(error.message);
    else { toast.success('Left club'); await load(); }
    setBusy(false);
  }

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;
  if (!club) return <div className="container py-16 text-center">Club not found.</div>;

  return (
    <div className="container py-8 max-w-4xl">
      <Link href="/clubs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> All clubs
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold mb-2">{club.name}</h1>
          <p className="text-muted-foreground">{club.description}</p>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {members.length} members</span>
            <span>{events.length} events</span>
          </div>
        </div>
        {user && (myMembership ? (
          <Button variant="outline" onClick={leave} disabled={busy} className="gap-2">
            <Check className="w-4 h-4" /> {busy ? '…' : 'Leave club'}
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.cover_image} alt={ev.title} className="w-full h-full object-cover" />
                  )}
                  <Badge className="absolute top-2 right-2 gap-1" variant={ev.visibility === 'club_only' ? 'default' : 'secondary'}>
                    {ev.visibility === 'club_only' ? <><Lock className="w-3 h-3" /> Club only</> : <><Globe className="w-3 h-3" /> Public</>}
                  </Badge>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold line-clamp-1">{ev.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(ev.starts_at), 'MMM d')}</span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ev.location}</span>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4">Members</h2>
      {members.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Be the first to join!</CardContent></Card>
      ) : (
        <Card><CardContent className="p-4">
          <div className="grid sm:grid-cols-2 gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded bg-muted/30 text-sm">
                <span>
                  <span className="font-medium">{m.profiles?.full_name || 'Member'}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{m.profiles?.email}</span>
                </span>
                <span className="text-xs text-muted-foreground">Joined {format(new Date(m.created_at), 'MMM d')}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

export default ClubDetailPage;
