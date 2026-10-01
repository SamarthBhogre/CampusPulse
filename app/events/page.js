'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Search, X, CalendarDays, SlidersHorizontal } from 'lucide-react';
import { addDays } from 'date-fns';
import PageHeader from '@/components/page-header';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import EventCard from '@/components/event-card';
import EventCardSkeleton from '@/components/event-card-skeleton';

const PAGE_SIZE = 24;

export default function EventsPage() {
  const supabase = getSupabaseBrowserClient();
  const [events, setEvents] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [retryToken, setRetryToken] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [clubFilter, setClubFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('upcoming');
  const [openOnly, setOpenOnly] = useState(false);

  // Debounce search input by 350ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Reset page when filters change
  useEffect(() => setPage(0), [debouncedQuery, clubFilter, dateFilter, openOnly]);

  const load = useCallback(async () => {
    let cancelled = false;
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      const dateFrom = dateFilter !== 'all' ? now.toISOString() : null;
      const dateTo = dateFilter === 'this-week'
        ? addDays(now, 7).toISOString()
        : dateFilter === 'this-month'
        ? addDays(now, 30).toISOString()
        : null;

      const [pageResult, clubsResult] = await Promise.all([
        supabase.rpc('get_events_page', {
          p_search:    debouncedQuery.trim() || null,
          p_club_id:   clubFilter !== 'all' ? clubFilter : null,
          p_date_from: dateFrom,
          p_date_to:   dateTo,
          p_open_only: openOnly,
          p_page:      page,
          p_page_size: PAGE_SIZE,
        }),
        page === 0
          ? supabase.from('clubs').select('id, name').order('name').limit(100)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (pageResult.error) throw pageResult.error;
      if (clubsResult.error) throw clubsResult.error;
      if (cancelled) return;

      const result = pageResult.data;
      setEvents(result?.events || []);
      setTotalCount(Number(result?.total || 0));
      if (clubsResult.data) setClubs(clubsResult.data);
    } catch (err) {
      if (!cancelled) setError('Could not load events. Please try again.');
    } finally {
      if (!cancelled) setLoading(false);
    }
  }, [supabase, debouncedQuery, clubFilter, dateFilter, openOnly, page]);

  useEffect(() => { load(); }, [load, retryToken]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasActiveFilters = query || clubFilter !== 'all' || dateFilter !== 'upcoming' || openOnly;

  function reset() {
    setQuery(''); setClubFilter('all'); setDateFilter('upcoming'); setOpenOnly(false);
  }

  return (
    <div className="container py-8 sm:py-10">
      <PageHeader
        eyebrow="Discover"
        title="Find your next campus moment"
        description="Explore events, meet your community, and find a way to get involved."
        className="animate-in-up"
      />

      {/* Filter bar */}
      <div className="my-6 rounded-xl border border-border/70 bg-card p-3 shadow-sm animate-in-fade">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <label htmlFor="event-search" className="sr-only">Search events</label>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              id="event-search"
              placeholder="Search events…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={clubFilter} onValueChange={setClubFilter}>
              <SelectTrigger className="h-9 w-auto min-w-[140px] bg-background" aria-label="Filter by club">
                <SelectValue placeholder="All clubs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clubs</SelectItem>
                {clubs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] bg-background" aria-label="Filter by date">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="this-week">This week</SelectItem>
                <SelectItem value="this-month">Next 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={openOnly ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => setOpenOnly((v) => !v)}
              aria-pressed={openOnly}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {openOnly ? 'Open tasks' : 'Has openings'}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={reset}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2.5 px-0.5 text-xs text-muted-foreground" aria-live="polite">
          {loading ? 'Loading…' : `${totalCount} event${totalCount === 1 ? '' : 's'}${hasActiveFilters ? ' matching filters' : ''}`}
        </p>
      </div>

      {/* Results */}
      {error ? (
        <ErrorState description={error} onRetry={() => setRetryToken((t) => t + 1)} />
      ) : loading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <EventCardSkeleton key={i} />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={hasActiveFilters ? 'No events match those filters' : 'No events are scheduled yet'}
          description={hasActiveFilters ? 'Try widening your search or clearing a filter.' : 'Check back soon for new ways to get involved on campus.'}
          action={hasActiveFilters && <Button variant="outline" onClick={reset}>Clear filters</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 animate-stagger">
          {events.map((ev) => (
            <EventCard key={ev.id} event={ev} capacity={ev.capacity} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-3" aria-label="Event pagination">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
