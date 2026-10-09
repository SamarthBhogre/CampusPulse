'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import { Skeleton } from '@/components/ui/skeleton';

function formatDate(v) {
  if (!v) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
}

function StatusBadge({ status }) {
  const map = { pending: 'default', approved: 'secondary', rejected: 'outline', none: 'outline' };
  return <Badge variant={map[status] || 'secondary'} className="capitalize">{status}</Badge>;
}

export default function OrganizersPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/organizer-requests', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load organizer requests');
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id, action) {
    setBusyId(id);
    try {
      const rejection_reason = action === 'reject' ? (window.prompt('Optional reason for rejection:') || '') : '';
      const res = await fetch(`/api/admin/organizer-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejection_reason }),
      });
      // Some deployments/proxies can return an empty success body even though
      // the PATCH completed. Do not turn a successful approval into a client
      // error just because there is no JSON to parse.
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not ${action}`);
      toast.success(action === 'approve' ? 'Organizer approved' : 'Request rejected');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter(r => r.organizer_request_status === 'pending');

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-xl">
        <ErrorState title="Could not load organizer requests" description={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Organizer Management</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Access queue
            <Badge variant={pending.length ? 'default' : 'secondary'}>{pending.length} pending</Badge>
          </CardTitle>
          <CardDescription>Students who requested organizer access appear here.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldCheck}
                title="No organizer requests"
                description="New requests will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="pl-6 font-medium"><div>{req.full_name || '—'}</div>{req.organizer_org_name && <div className="text-xs font-normal text-muted-foreground">{req.organizer_org_name} · {req.organizer_org_type}</div>}{req.organizer_org_description && <details className="mt-1 max-w-xs text-xs font-normal"><summary className="cursor-pointer text-primary">View application details</summary><p className="mt-1 text-muted-foreground">{req.organizer_org_description}</p>{req.organizer_experience && <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Experience:</span> {req.organizer_experience}</p>}{req.organizer_org_website && <a className="mt-1 block text-primary hover:underline" href={req.organizer_org_website} target="_blank" rel="noreferrer">Open organization link</a>}</details>}</TableCell>
                      <TableCell className="text-muted-foreground">{req.email}</TableCell>
                      <TableCell><StatusBadge status={req.organizer_request_status} /></TableCell>
                      <TableCell className="text-muted-foreground"><div>{formatDate(req.organizer_requested_at)}</div>{req.organizer_rejection_reason && <div className="max-w-xs text-xs text-destructive">{req.organizer_rejection_reason}</div>}</TableCell>
                      <TableCell className="pr-6 text-right">
                        {req.organizer_request_status === 'pending' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => decide(req.id, 'approve')}
                              disabled={busyId === req.id}
                            >
                              {busyId === req.id ? 'Approving…' : 'Approve'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decide(req.id, 'reject')}
                              disabled={busyId === req.id}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Done</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
