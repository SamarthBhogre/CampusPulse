'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';
import EmptyState from '@/components/empty-state';
import { toast } from 'sonner';
import { Users, Search, Check, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function AttendancePage({ params }) {
  const { id } = use(params);
  const supabase = getSupabaseBrowserClient();
  const [attendance, setAttendance] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null); // profile_id being toggled

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [evRes, attRes, rsvpRes] = await Promise.all([
        supabase.from('events').select('id, title, starts_at').eq('id', id).maybeSingle(),
        fetch(`/api/organizer/events/${id}/attendance`),
        supabase.from('event_rsvps').select('id, profile_id, profiles!event_rsvps_profile_id_fkey(full_name, email)').eq('event_id', id),
      ]);
      if (evRes.error) throw evRes.error;
      setEvent(evRes.data);
      if (!attRes.ok) throw new Error('Could not load attendance');
      const attData = await attRes.json();
      setAttendance(attData.attendance || []);
      setRsvps(rsvpRes.data || []);
    } catch (err) {
      setError(err.message || 'Could not load attendance data');
    } finally {
      setLoading(false);
    }
  }, [id, supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggleAttendance(profileId, isCheckedIn) {
    setBusy(profileId);
    try {
      if (isCheckedIn) {
        const res = await fetch(`/api/organizer/events/${id}/attendance?profileId=${profileId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Could not remove check-in');
        toast.success('Check-in removed');
      } else {
        const res = await fetch(`/api/organizer/events/${id}/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_id: profileId }),
        });
        if (!res.ok) throw new Error('Could not mark attendance');
        toast.success('Checked in!');
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const attendedIds = new Set(attendance.map(a => a.profile_id));

  // Build roster from RSVPs + already checked-in (in case someone wasn't RSVP'd)
  const allAttended = attendance.filter(a => !rsvps.find(r => r.profile_id === a.profile_id));
  const roster = [
    ...rsvps.map(r => ({ profile_id: r.profile_id, full_name: r.profiles?.full_name, email: r.profiles?.email, from: 'rsvp' })),
    ...allAttended.map(a => ({ profile_id: a.profile_id, full_name: a.profiles?.full_name, email: a.profiles?.email, from: 'manual' })),
  ];

  const filtered = search.trim()
    ? roster.filter(r =>
        r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        r.email?.toLowerCase().includes(search.toLowerCase())
      )
    : roster;

  const checkedInCount = attendance.length;
  const totalRsvps = rsvps.length;

  if (loading) {
    return (
      <div className="container max-w-3xl py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <Link href={`/dashboard/organizer/events/${id}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to event
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Attendance</h1>
          {event && <p className="text-muted-foreground text-sm">{event.title} · {format(new Date(event.starts_at), 'PPP')}</p>}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">{checkedInCount} / {totalRsvps} checked in</Badge>
        </div>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search attendees…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Users} title={search ? 'No matches' : 'No RSVPs yet'} description={search ? 'Try a different name.' : 'Nobody has RSVPed to this event yet.'} />
          ) : (
            <div className="space-y-2">
              {filtered.map(person => {
                const isCheckedIn = attendedIds.has(person.profile_id);
                const isBusy = busy === person.profile_id;
                return (
                  <Card key={person.profile_id} className={isCheckedIn ? 'border-emerald-500/40 bg-emerald-50/5' : ''}>
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${ isCheckedIn ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          {(person.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{person.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground truncate">{person.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isCheckedIn && <Badge variant="secondary" className="text-emerald-600 text-xs"><Check className="h-3 w-3 mr-1" />Checked in</Badge>}
                        <Button
                          size="sm"
                          variant={isCheckedIn ? 'outline' : 'default'}
                          onClick={() => toggleAttendance(person.profile_id, isCheckedIn)}
                          disabled={isBusy}
                          className="gap-1"
                        >
                          {isBusy ? '…' : isCheckedIn ? <><X className="h-3.5 w-3.5" />Undo</> : <><Check className="h-3.5 w-3.5" />Check in</>}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
