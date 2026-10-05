'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Users, ArrowRight, Check, CalendarRange, Plus } from 'lucide-react';
import PageHeader from '@/components/page-header';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export default function ClubsPage() {
  const supabase = getSupabaseBrowserClient();
  const [clubs, setClubs] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const [{ data: cl }, { data: ownMemberships }, { data: memberCounts, error: countsError }] = await Promise.all([
        supabase.from('clubs').select('id, name, description, created_at, events(id)').order('name').limit(100),
        user ? supabase.from('club_members').select('id, club_id').eq('profile_id', user.id) : Promise.resolve({ data: [] }),
        supabase.rpc('get_club_member_counts'),
      ]);
      if (countsError) throw countsError;
      const countMap = Object.fromEntries((memberCounts || []).map((row) => [row.club_id, Number(row.member_count || 0)]));
      setClubs((cl || []).map((c) => ({ ...c, member_count: countMap[c.id] || 0 })));
      setMemberships(ownMemberships || []);
    } catch (err) {
      console.error('Clubs load failed', err);
      setError('We could not load clubs right now.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const memberSet = new Set(memberships.map((m) => m.club_id));

  async function join(clubId) {
    if (!user) { toast.error('Sign in to join a club'); return; }
    setBusyId(clubId);
    const { error } = await supabase.from('club_members').insert({ club_id: clubId, profile_id: user.id });
    if (error) toast.error('Could not join this club right now.');
    else { toast.success('Joined club!'); await load(); }
    setBusyId(null);
  }

  async function leave(clubId) {
    setBusyId(clubId);
    const membership = memberships.find((m) => m.club_id === clubId);
    if (!membership) return;
    const { error } = await supabase.from('club_members').delete().eq('id', membership.id);
    if (error) toast.error('Could not leave this club right now.');
    else { toast.success('Left club'); await load(); }
    setBusyId(null);
  }

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader
        eyebrow="Find your people"
        title="Campus clubs"
        description="Join a community, discover member-only events, and stay in the loop."
        action={user ? <Link href="/clubs/request"><Button className="gap-2"><Plus className="h-4 w-4" /> Propose a club</Button></Link> : null}
        className="animate-in-up"
      />

      {error ? (
        <ErrorState className="mt-8" description={error} onRetry={load} />
      ) : loading ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-border/70 bg-card p-6 shadow-sm space-y-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : clubs.length === 0 ? (
        <EmptyState className="mt-8" icon={Users} title="No clubs yet" description="There are no clubs listed right now. Check back soon." />
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3 animate-stagger">
          {clubs.map((c) => {
            const isMember = memberSet.has(c.id);
            return (
              <div key={c.id} className={cn('flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md', isMember ? 'border-primary/30' : 'border-border/70')}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <h3 className="font-semibold leading-snug">{c.name}</h3>
                  {isMember && (
                    <Badge variant="secondary" className="gap-1 shrink-0 text-[10px]">
                      <Check className="h-3 w-3" /> Member
                    </Badge>
                  )}
                </div>
                {c.description && (
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed flex-1">{c.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                  <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{c.member_count} members</span>
                  <span className="flex items-center gap-1.5"><CalendarRange className="h-3.5 w-3.5" />{c.events?.length || 0} events</span>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Link href={`/clubs/${c.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      View <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {user && (
                    isMember ? (
                      <Button variant="ghost" size="sm" onClick={() => leave(c.id)} disabled={busyId === c.id} className="text-muted-foreground">
                        {busyId === c.id ? 'â€¦' : 'Leave'}
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => join(c.id)} disabled={busyId === c.id}>
                        {busyId === c.id ? 'â€¦' : 'Join'}
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
