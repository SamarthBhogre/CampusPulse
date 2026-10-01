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
import { RefreshCw } from 'lucide-react';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';

/**
 * Bucket raw items into daily counts over a trailing window.
 * @param {Array<object>} items - Array of records with a date field.
 * @param {string} dateField - Key containing the ISO timestamp.
 * @param {number} days - Number of trailing days to include.
 * @returns {Array<{date: string, count: number}>}
 */
function bucketByDay(items, dateField, days) {
  const now = new Date();
  const interval = eachDayOfInterval({ start: subDays(now, days - 1), end: now });
  const map = {};
  interval.forEach(d => { map[format(d, 'MMM d')] = 0; });
  items.forEach(item => {
    const key = format(startOfDay(new Date(item[dateField])), 'MMM d');
    if (map[key] !== undefined) map[key]++;
  });
  return Object.entries(map).map(([date, count]) => ({ date, count }));
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [window, setWindow] = useState('30');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/analytics?days=${window}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load analytics');
      const data = await res.json();
      setAnalytics(data.analytics);
    } catch (err) {
      setError(err.message || 'Could not load analytics');
    } finally {
      setLoading(false);
    }
  }, [window]);

  useEffect(() => { load(); }, [load]);

  const days = Number(window);

  const signupsData = analytics?.user_signups
    ? bucketByDay(analytics.user_signups, 'created_at', days)
    : [];

  const eventsData = analytics?.events_created
    ? bucketByDay(analytics.events_created, 'created_at', days)
    : [];

  const rsvpData = analytics?.rsvps
    ? bucketByDay(analytics.rsvps, 'created_at', days)
    : [];

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
          <Select value={window} onValueChange={setWindow}>
            <SelectTrigger className="w-32" aria-label="Select time window">
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

      {/* User Signups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New user signups</CardTitle>
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
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Signups"
                  strokeWidth={2}
                  dot={false}
                  className="stroke-primary"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Events Created */}
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
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]} className="fill-primary" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* RSVPs */}
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
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="count" name="RSVPs" radius={[4, 4, 0, 0]} className="fill-primary/70" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
