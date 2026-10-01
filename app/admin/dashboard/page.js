'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users, Calendar, Building2, ShieldCheck, Heart, ClipboardList,
  TrendingUp, AlertCircle, RefreshCw, CheckCircle2, Clock, XCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';

function MetricCard({ icon: Icon, label, value, sub, href, colorClass = '' }) {
  const content = (
    <Card className={`shadow-sm transition-shadow hover:shadow-md ${href ? 'cursor-pointer' : ''} ${colorClass}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-3xl font-bold tracking-tight">{value ?? '—'}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function SkeletonMetric() {
  return <Skeleton className="h-28 rounded-xl" />;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load stats');
      const data = await res.json();
      setStats(data.stats);
    } catch (err) {
      setError(err.message || 'Could not load admin stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="p-6 max-w-xl">
        <ErrorState title="Stats unavailable" description={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Administration</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Overview</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Attention Required */}
      {!loading && stats && stats.pending_organizer_requests > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">
                  {stats.pending_organizer_requests} organizer request{stats.pending_organizer_requests !== 1 ? 's' : ''} awaiting review
                </p>
                <p className="text-xs text-muted-foreground">Review and approve or reject organizer applications.</p>
              </div>
            </div>
            <Link href="/admin/dashboard/organizers">
              <Button size="sm">Review</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* People Metrics */}
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">People</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            [1, 2, 3, 4].map(i => <SkeletonMetric key={i} />)
          ) : (
            <>
              <MetricCard icon={Users} label="Total users" value={stats?.users?.total} href="/admin/dashboard/users" />
              <MetricCard icon={Users} label="Students" value={stats?.users?.students} colorClass="border-blue-500/20" />
              <MetricCard icon={ShieldCheck} label="Organizers" value={stats?.users?.organizers} href="/admin/dashboard/organizers" colorClass="border-violet-500/20" />
              <MetricCard
                icon={AlertCircle}
                label="Pending requests"
                value={stats?.pending_organizer_requests}
                href="/admin/dashboard/organizers"
                colorClass={stats?.pending_organizer_requests > 0 ? 'border-amber-500/30 bg-amber-500/5' : ''}
              />
            </>
          )}
        </div>
      </section>

      {/* Events Metrics */}
      <section aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Events</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading ? (
            [1, 2, 3, 4].map(i => <SkeletonMetric key={i} />)
          ) : (
            <>
              <MetricCard icon={Calendar} label="Total events" value={stats?.events?.total} href="/admin/dashboard/events" />
              <MetricCard icon={Clock} label="Upcoming" value={stats?.events?.upcoming} colorClass="border-emerald-500/20" />
              <MetricCard icon={CheckCircle2} label="This week" value={stats?.events?.this_week} colorClass="border-primary/20" />
              <MetricCard icon={XCircle} label="Hidden / cancelled" value={(stats?.events?.hidden || 0) + (stats?.events?.cancelled || 0)} colorClass="border-destructive/20" />
            </>
          )}
        </div>
      </section>

      {/* Participation Metrics */}
      <section aria-labelledby="participation-heading">
        <h2 id="participation-heading" className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Participation</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {loading ? (
            [1, 2, 3].map(i => <SkeletonMetric key={i} />)
          ) : (
            <>
              <MetricCard icon={Heart} label="Total RSVPs" value={stats?.rsvps?.total} colorClass="border-rose-500/20" />
              <MetricCard icon={ClipboardList} label="Volunteer signups" value={stats?.volunteer_signups?.total} colorClass="border-teal-500/20" />
              <MetricCard icon={Building2} label="Total clubs" value={stats?.clubs?.total} href="/admin/dashboard/clubs" colorClass="border-orange-500/20" />
            </>
          )}
        </div>
      </section>

      {/* Quick links */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard/organizers"><Button variant="outline" size="sm">Organizer requests</Button></Link>
          <Link href="/admin/dashboard/users"><Button variant="outline" size="sm">User management</Button></Link>
          <Link href="/admin/dashboard/events"><Button variant="outline" size="sm">Event moderation</Button></Link>
          <Link href="/admin/dashboard/analytics"><Button variant="outline" size="sm">Analytics</Button></Link>
          <Link href="/admin/dashboard/audit-log"><Button variant="outline" size="sm">Audit log</Button></Link>
          <Link href="/admin/dashboard/system-health"><Button variant="outline" size="sm">System health</Button></Link>
        </div>
      </section>
    </div>
  );
}