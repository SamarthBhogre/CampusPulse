'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';

/**
 * Render a coloured status badge for a health-check result.
 */
function StatusIndicator({ status }) {
  if (status === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">Healthy</span>
      </span>
    );
  }
  if (status === 'degraded') {
    return (
      <span className="flex items-center gap-1.5 text-amber-500">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">Degraded</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-destructive">
      <XCircle className="h-4 w-4" aria-hidden="true" />
      <span className="text-sm font-medium">Down</span>
    </span>
  );
}

function HealthCard({ label, status, latencyMs, detail }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">{label}</p>
          <StatusIndicator status={status} />
        </div>
        {latencyMs !== undefined && latencyMs !== null && (
          <p className="text-xs text-muted-foreground">Latency: {latencyMs} ms</p>
        )}
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastChecked, setLastChecked] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/health', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load system health');
      const data = await res.json();
      setHealth(data.health);
      setLastChecked(new Date());
    } catch (err) {
      setError(err.message || 'Could not load system health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const overallOk = health && Object.values(health).every(s => s?.status === 'ok');
  const overallStatus = !health
    ? 'unknown'
    : overallOk
    ? 'ok'
    : Object.values(health).some(s => s?.status === 'down')
    ? 'down'
    : 'degraded';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">System Health</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      {!loading && health && (
        <Card className={
          overallStatus === 'ok'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : overallStatus === 'degraded'
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-destructive/30 bg-destructive/5'
        }>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {overallStatus === 'ok' && 'All systems operational'}
                {overallStatus === 'degraded' && 'Some systems are degraded'}
                {overallStatus === 'down' && 'One or more systems are down'}
              </p>
              {lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked {new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(lastChecked)}
                </p>
              )}
            </div>
            <Badge
              variant={overallStatus === 'ok' ? 'secondary' : overallStatus === 'degraded' ? 'outline' : 'destructive'}
              className="capitalize"
            >
              {overallStatus}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Checks grid */}
      {error ? (
        <ErrorState title="Could not load system health" description={error} onRetry={load} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            [1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)
          ) : health ? (
            Object.entries(health).map(([key, value]) => (
              <HealthCard
                key={key}
                label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                status={value?.status}
                latencyMs={value?.latency_ms}
                detail={value?.detail}
              />
            ))
          ) : null}
        </div>
      )}
    </div>
  );
}
