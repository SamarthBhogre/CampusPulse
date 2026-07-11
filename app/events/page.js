'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, MapPin, Search, X, Heart, Lock } from 'lucide-react';
import { format, isAfter, addDays, startOfDay } from 'date-fns';

function EventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('upcoming');
  const [openOnly, setOpenOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: ev }, { data: cl }, rsvpRes] = await Promise.all([
        supabase.from('events').select('*, clubs(id, name), tasks(id, volunteers_needed), volunteer_signups(id)').order('starts_at', { ascending: true }),
        supabase.from('clubs').select('*').order('name'),
        supabase.from('event_rsvps').select('id, event_id'),
      ]);
      const rsvpsByEvent = {};
      (rsvpRes?.data || []).forEach((r) => {
        rsvpsByEvent[r.event_id] = (rsvpsByEvent[r.event_id] || 0) + 1;
      });
      setEvents((ev || []).map((e) => ({ ...e, rsvp_count: rsvpsByEvent[e.id] || 0 })));
      setClubs(cl || []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (query && !`${ev.title} ${ev.description || ''}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (clubFilter !== 'all' && ev.club_id !== clubFilter) return false;
      const starts = new Date(ev.starts_at);
      if (dateFilter === 'upcoming' && !isAfter(starts, new Date())) return false;
      if (dateFilter === 'this-week' && !isAfter(starts, new Date()) || (dateFilter === 'this-week' && isAfter(starts, addDays(new Date(), 7)))) return false;
      if (dateFilter === 'this-month' && (!isAfter(starts, new Date()) || isAfter(starts, addDays(new Date(), 30)))) return false;
      if (openOnly) {
        const totalNeeded = (ev.tasks || []).reduce((sum, t) => sum + (t.volunteers_needed || 0), 0);
        const totalFilled = (ev.volunteer_signups || []).length;
        if (totalNeeded === 0 || totalFilled >= totalNeeded) return false;
      }
      return true;
    });
  }, [events, query, clubFilter, dateFilter, openOnly]);

  const hasActiveFilters = query || clubFilter !== 'all' || dateFilter !== 'upcoming' || openOnly;

  function reset() {
    setQuery(''); setClubFilter('all'); setDateFilter('upcoming'); setOpenOnly(false);
  }

  return (
    <div className="container py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Campus Events</h1>
        <p className="text-muted-foreground mt-1">Find something happening on campus — and lend a hand.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={clubFilter} onValueChange={setClubFilter}>
          <SelectTrigger className="md:w-52"><SelectValue placeholder="All clubs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clubs</SelectItem>
            {clubs.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="this-week">This week</SelectItem>
            <SelectItem value="this-month">Next 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={openOnly ? 'default' : 'outline'} onClick={() => setOpenOnly((v) => !v)}>
          {openOnly ? 'Open only ✓' : 'Open tasks only'}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={reset} className="gap-1"><X className="w-4 h-4" /> Clear</Button>
        )}
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (<div key={i} className="h-72 rounded-lg bg-muted animate-pulse" />))}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          No events match your filters. {hasActiveFilters && <button onClick={reset} className="text-primary hover:underline ml-1">Clear filters</button>}
        </CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((ev) => {
            const totalNeeded = (ev.tasks || []).reduce((s, t) => s + (t.volunteers_needed || 0), 0);
            const totalFilled = (ev.volunteer_signups || []).length;
            const openSlots = Math.max(0, totalNeeded - totalFilled);
            return (
              <Link key={ev.id} href={`/events/${ev.id}`}>
                <Card className="h-full overflow-hidden hover:shadow-xl transition group cursor-pointer">
                  <div className="aspect-video bg-gradient-to-br from-primary/20 to-purple-500/20 relative overflow-hidden">
                    {ev.cover_image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ev.cover_image} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    )}
                    {ev.clubs?.name && (
                      <Badge className="absolute top-3 left-3" variant="secondary">{ev.clubs.name}</Badge>
                    )}
                    {ev.visibility === 'club_only' && (
                      <Badge className="absolute top-3 right-3 gap-1" variant="default"><Lock className="w-3 h-3" /> Club only</Badge>
                    )}
                  </div>
                  <CardContent className="p-5">
                    <h3 className="font-semibold text-lg mb-2 line-clamp-1">{ev.title}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{ev.description}</p>
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {format(new Date(ev.starts_at), 'MMM d, yyyy • h:mm a')}</div>
                      {ev.location && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {ev.location}</div>}
                    </div>
                    {totalNeeded > 0 && (
                      <div className="mt-4 text-xs font-medium flex items-center gap-3">
                        {openSlots > 0 ? (
                          <span className="text-primary">{openSlots} volunteer slot{openSlots > 1 ? 's' : ''} open</span>
                        ) : (
                          <span className="text-muted-foreground">All slots filled</span>
                        )}
                        {ev.rsvp_count > 0 && (
                          <span className="text-muted-foreground flex items-center gap-1"><Heart className="w-3 h-3 fill-current text-rose-500" />{ev.rsvp_count}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default EventsPage;
