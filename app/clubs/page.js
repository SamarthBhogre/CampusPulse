'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Users, ArrowRight, Check } from 'lucide-react';

function ClubsPage() {
  const supabase = getSupabaseBrowserClient();
  const [clubs, setClubs] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const { data: cl } = await supabase.from('clubs').select('*, events(id)').order('name');
      // fetch club_members separately (resilient if table missing)
      const { data: allMembers } = await supabase.from('club_members').select('id, club_id, profile_id');
      const countMap = {};
      (allMembers || []).forEach((m) => { countMap[m.club_id] = (countMap[m.club_id] || 0) + 1; });
      setClubs((cl || []).map((c) => ({ ...c, member_count: countMap[c.id] || 0 })));
      if (user && allMembers) {
        setMemberships(allMembers.filter((m) => m.profile_id === user.id));
      }
    } catch (err) {
      console.error('Clubs load failed', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const memberSet = new Set(memberships.map((m) => m.club_id));

  async function join(clubId) {
    if (!user) { toast.error('Sign in to join a club'); return; }
    setBusyId(clubId);
    const { error } = await supabase.from('club_members').insert({ club_id: clubId, profile_id: user.id });
    if (error) toast.error(error.message);
    else { toast.success('Joined club!'); await load(); }
    setBusyId(null);
  }

  async function leave(clubId) {
    setBusyId(clubId);
    const membership = memberships.find((m) => m.club_id === clubId);
    if (!membership) return;
    const { error } = await supabase.from('club_members').delete().eq('id', membership.id);
    if (error) toast.error(error.message);
    else { toast.success('Left club'); await load(); }
    setBusyId(null);
  }

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Campus Clubs</h1>
        <p className="text-muted-foreground mt-1">Join a club to see their private events and stay in the loop.</p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clubs.map((c) => {
            const isMember = memberSet.has(c.id);
            return (
              <Card key={c.id} className="hover:shadow-lg transition">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg">{c.name}</h3>
                    {isMember && <Badge variant="secondary" className="gap-1"><Check className="w-3 h-3" /> Member</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {c.member_count || 0} members</span>
                    <span>{c.events?.length || 0} events</span>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/clubs/${c.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1">View <ArrowRight className="w-3.5 h-3.5" /></Button>
                    </Link>
                    {user && (isMember ? (
                      <Button variant="ghost" size="sm" onClick={() => leave(c.id)} disabled={busyId === c.id}>
                        {busyId === c.id ? '…' : 'Leave'}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => join(c.id)} disabled={busyId === c.id}>
                        {busyId === c.id ? '…' : 'Join'}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ClubsPage;
