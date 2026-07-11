'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, MapPin, Search } from 'lucide-react';
import { format } from 'date-fns';

function EventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clubs(name), tasks(id)')
        .order('starts_at', { ascending: true });
      if (!error) setEvents(data || []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = events.filter((e) =>
    !query || e.title.toLowerCase().includes(query.toLowerCase()) || e.description?.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="container py-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">Campus Events</h1>
          <p className="text-muted-foreground mt-1">Find something happening on campus — and lend a hand.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search events…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-72 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No events yet. Organizers can create some from the dashboard!</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((ev) => (
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
                </div>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-lg mb-2 line-clamp-1">{ev.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{ev.description}</p>
                  <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {format(new Date(ev.starts_at), 'MMM d, yyyy • h:mm a')}</div>
                    {ev.location && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {ev.location}</div>}
                  </div>
                  {ev.tasks?.length > 0 && (
                    <div className="mt-4 text-xs text-primary font-medium">{ev.tasks.length} volunteer task{ev.tasks.length > 1 ? 's' : ''} open</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default EventsPage;
