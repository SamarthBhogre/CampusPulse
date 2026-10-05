'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Building2, RefreshCw } from 'lucide-react';

export default function AdminClubRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/club-requests', { cache: 'no-store' });
    if (res.ok) setRequests((await res.json()).requests || []);
    else toast.error('Could not load club requests');
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function decide(id, action) {
    setBusy(id);
    const res = await fetch('/api/admin/club-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || 'Could not review request');
    else { toast.success(action === 'approve' ? 'Club approved and manager assigned' : 'Club request rejected'); await load(); }
    setBusy(null);
  }
  return <div className="p-6 space-y-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Admin</p><h1 className="text-2xl font-bold tracking-tight mt-1">Club Requests</h1></div><Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Proposed clubs <Badge>{requests.filter((r) => r.status === 'pending').length} pending</Badge></CardTitle><CardDescription>Approve a request to create the club and assign its requester as the first manager.</CardDescription></CardHeader><CardContent className="space-y-4">{loading ? <p className="text-sm text-muted-foreground">Loading…</p> : requests.length === 0 ? <p className="text-sm text-muted-foreground">No club requests yet.</p> : requests.map((request) => <div key={request.id} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{request.name}</h2><p className="text-sm text-muted-foreground">{request.profiles?.full_name || 'Unknown'} · {request.profiles?.email}</p></div><Badge variant={request.status === 'pending' ? 'default' : 'secondary'} className="capitalize">{request.status}</Badge></div><p className="mt-3 text-sm">{request.description}</p>{request.status === 'pending' && <div className="mt-4 flex gap-2"><Button size="sm" onClick={() => decide(request.id, 'approve')} disabled={busy === request.id}>Approve and assign manager</Button><Button size="sm" variant="outline" onClick={() => decide(request.id, 'reject')} disabled={busy === request.id}>Reject</Button></div>}</div>)}</CardContent></Card></div>;
}
