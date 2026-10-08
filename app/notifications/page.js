'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/empty-state';
import ErrorState from '@/components/error-state';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const TYPE_LABELS = {
  rsvp_confirmation: 'RSVP Confirmed',
  volunteer_confirmation: 'Volunteer Signup',
  organizer_approved: 'Organizer Approved',
  organizer_rejected: 'Organizer Request',
  event_updated: 'Event Updated',
  event_cancelled: 'Event Cancelled',
  event_reminder: 'Event Reminder',
  organizer_message: 'Organizer Message',
  rsvp_received: 'New RSVP',
  volunteer_received: 'New Volunteer',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/notifications?page=${page}`);
      if (!res.ok) throw new Error('Could not load notifications');
      const data = await res.json();
      setNotifications(data.notifications || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!res.ok) throw new Error('Failed');
      toast.success('All marked as read');
      await load();
    } catch { toast.error('Could not mark as read'); }
    finally { setMarkingAll(false); }
  }

  const unread = notifications.filter(n => !n.read_at).length;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="container max-w-2xl py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7" aria-hidden="true" /> Notifications
          </h1>
          {unread > 0 && <p className="text-sm text-muted-foreground mt-0.5">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={markingAll} className="gap-2">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            {markingAll ? 'Marking…' : 'Mark all read'}
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState description={error} onRetry={load} />
      ) : loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="Notifications about your RSVPs, volunteer signups, and account activity will appear here." />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card key={n.id} className={n.read_at ? 'opacity-70' : 'border-primary/30 bg-primary/[0.02]'}>
              <CardContent className="p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={n.read_at ? 'secondary' : 'default'} className="text-xs">
                      {TYPE_LABELS[n.type] || n.type}
                    </Badge>
                    {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" aria-label="Unread" />}
                  </div>
                  {n.payload?.event_title && (
                    <p className="text-sm font-medium mt-1">{n.payload.event_title}</p>
                  )}
                  {n.payload?.full_name && (
                    <p className="text-sm mt-1">Hi {n.payload.full_name}!</p>
                  )}
                  {n.payload?.actor_name && (
                    <p className="text-sm mt-1">{n.payload.actor_name} {n.type === 'rsvp_received' ? 'RSVPed' : 'signed up to volunteer'}.</p>
                  )}
                  {n.type === 'organizer_message' && n.payload?.message && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{n.payload.message}</p>
                  )}
                  {n.type === 'organizer_message' && n.payload?.sender_name && (
                    <p className="text-xs text-muted-foreground mt-2">From {n.payload.sender_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
