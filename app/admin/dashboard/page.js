'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, RefreshCw, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/admin/me', { cache: 'no-store' });
      if (meRes.status === 401) {
        router.replace('/admin/sign-in');
        return;
      }
      if (!meRes.ok) throw new Error('Admin access required');
      const me = await meRes.json();
      setAdmin(me.profile);

      const reqRes = await fetch('/api/admin/organizer-requests', { cache: 'no-store' });
      if (!reqRes.ok) {
        const body = await reqRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load organizer requests');
      }
      const body = await reqRes.json();
      setRequests(body.requests || []);
    } catch (err) {
      setError(err?.message || 'Admin dashboard failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function decide(id, action) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/organizer-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not ${action} request`);
      toast.success(action === 'approve' ? 'Organizer approved' : 'Request rejected');
      await load();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/admin/sign-in');
  }

  if (loading) {
    return <div className="-mt-16 min-h-screen grid place-items-center text-muted-foreground">Loading admin dashboard...</div>;
  }

  if (error) {
    return (
      <div className="-mt-16 min-h-screen grid place-items-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Admin dashboard unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={load}>Try again</Button>
            <Link href="/admin/sign-in"><Button variant="outline">Admin sign in</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingCount = requests.filter((r) => r.organizer_request_status === 'pending').length;

  return (
    <div className="-mt-16 min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold">Campus Pulse Admin</p>
              <p className="text-xs text-muted-foreground">{admin?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="w-4 h-4" /> Refresh</Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-2"><LogOut className="w-4 h-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <main className="container py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Organizer requests</h1>
          <p className="text-muted-foreground mt-1">Approve verified organizers without exposing admin tools in the main app.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Access queue <Badge variant={pendingCount ? 'default' : 'secondary'}>{pendingCount} pending</Badge>
            </CardTitle>
            <CardDescription>Students who selected Organizer during signup appear here.</CardDescription>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No organizer requests yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.full_name || '—'}</TableCell>
                      <TableCell>{request.email}</TableCell>
                      <TableCell>
                        <Badge variant={request.organizer_request_status === 'pending' ? 'default' : 'secondary'}>
                          {request.organizer_request_status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(request.organizer_requested_at)}</TableCell>
                      <TableCell className="text-right">
                        {request.organizer_request_status === 'pending' ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => decide(request.id, 'approve')} disabled={busyId === request.id}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => decide(request.id, 'reject')} disabled={busyId === request.id}>Reject</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
