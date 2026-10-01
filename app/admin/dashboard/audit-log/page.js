'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';
import EmptyState from '@/components/empty-state';

function ActionBadge({ action }) {
  const danger = ['user_suspend', 'event_hide', 'event_cancel', 'organizer_rejected'];
  const good = ['organizer_approved', 'user_restore', 'event_restore'];
  const variant = danger.includes(action) ? 'destructive' : good.includes(action) ? 'secondary' : 'outline';
  return <Badge variant={variant} className="text-xs font-mono">{action}</Badge>;
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/audit-log?page=${page}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load audit log');
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Audit Log</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error ? (
        <ErrorState title="Could not load audit log" description={error} onRetry={load} />
      ) : entries.length === 0 && !loading ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit entries yet"
          description="Administrative actions will be recorded here."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : entries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-6 text-xs text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(e.created_at))}
                    </TableCell>
                    <TableCell className="text-sm">{e.profiles?.full_name || e.profiles?.email || '—'}</TableCell>
                    <TableCell><ActionBadge action={e.action} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.target_type ? `${e.target_type}:${e.target_id?.slice(0, 8)}…` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {e.metadata ? JSON.stringify(e.metadata) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-6 py-3 border-t text-sm text-muted-foreground">
            <span>{total} entries</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="flex items-center px-2">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
