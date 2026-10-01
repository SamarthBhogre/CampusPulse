'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';
import { RefreshCw, Users, CalendarDays, Heart, UserCheck } from 'lucide-react';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';

/**
 * Bucket raw items into daily counts over a trailing window.
 */
function bucketByDay(items, dateField, days) {
  const now = new Date();
  const interval = eachDayOfInterval({ start: subDays(now, days - 1), end: now });
  const map = {};
  interval.forEach(d => { map[format(d, 'MMM d')] = 0; });
  (items || []).forEach(item => {
    const key = format(startOfDay(new Date(item[dateField])), 'MMM d');
    if (map[key] !== undefined) map[key]++;
  });
  return Object.entries(map).map(([date, count]) => ({ date, count }));
}

function StatCard({ icon: Icon, label, value, sub, loading }) {
  if (loading) return <Skeleton className="h-28 rounded-xl" />;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <p className="text-3xl font-bold">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [timeWindow, setTimeWindow] = useState('30');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/analytics?days=${timeWindow}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load analytics');
      const data = await res.json();
      setAnalytics(data.analytics);
      setSummary(data.summary);
    } catch (err) {
      setError(err.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, [timeWindow]);

  useEffect(() => { load(); }, [load]);

  const days = Number(timeWindow);

  const signupsData   = bucketByDay(analytics?.user_signups,        'created_at', days);
  const eventsData    = bucketByDay(analytics?.events_created,       'created_at', days);
  const rsvpData      = bucketByDay(analytics?.rsvps,               'created_at', days);
  const volunteerData = bucketByDay(analytics?.volunteer_signups,    'created_at', days);

  if (error) {
    return (
      <div className="p-6 max-w-xl">
        <ErrorState title="Analytics unavailable" description={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Analytics</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeWindow} onValueChange={setTimeWindow}>
            <SelectTrigger className="w-36" aria-label="Select time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Total Users" loading={loading}
          value={summary?.total_users?.toLocaleString()}
          sub={summary?.new_users ? `+${summary.new_users} this period` : undefined}
        />
        <StatCard
          icon={CalendarDays} label="Total Events" loading={loading}
          value={summary?.total_events?.toLocaleString()}
          sub={summary?.new_events ? `+${summary.new_events} this period` : undefined}
        />
        <StatCard
          icon={Heart} label="Total RSVPs" loading={loading}
          value={summary?.total_rsvps?.toLocaleString()}
          sub={summary?.new_rsvps ? `+${summary.new_rsvps} this period` : undefined}
        />
        <StatCard
          icon={UserCheck} label="Volunteer Signups" loading={loading}
          value={summary?.total_clubs?.toLocaleString()}
          sub={summary?.new_volunteer_signups ? `+${summary.new_volunteer_signups} this period` : undefined}
        />
      </div>

      {/* User Signups chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New user registrations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <LineChart data={signupsData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }} />
                <Line type="monotone" dataKey="count" name="Signups" strokeWidth={2} dot={false} className="stroke-primary" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Events Created chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events created</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={eventsData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }} />
                <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} className="fill-primary" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* RSVPs chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">RSVPs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={rsvpData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }} />
                <Bar dataKey="count" name="RSVPs" radius={[4, 4, 0, 0]} className="fill-primary/70" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Volunteer signups chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volunteer signups</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={volunteerData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} labelStyle={{ fontWeight: 600 }} />
                <Bar dataKey="count" name="Signups" radius={[4, 4, 0, 0]} className="fill-emerald-500/70" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
