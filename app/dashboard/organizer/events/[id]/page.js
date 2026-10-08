'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import ImageUpload from '@/components/image-upload';
import { downloadCSV } from '@/lib/csv';
import { ArrowLeft, Plus, Trash2, Save, Users, Heart, Download, Send } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/error-state';
import EmptyState from '@/components/empty-state';

function toLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ManageEventPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [signups, setSignups] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [newTask, setNewTask] = useState({ title: '', description: '', volunteers_needed: 1 });
  const [announcement, setAnnouncement] = useState({ message: '', audience: 'both' });
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // Fetch event via API (server-validates organizer ownership)
      const evRes = await fetch(`/api/organizer/events/${id}`, { cache: 'no-store' });
      if (evRes.status === 401) { router.push('/auth/sign-in'); return; }
      if (evRes.status === 403 || evRes.status === 404) {
        router.push('/dashboard/organizer');
        return;
      }
      if (!evRes.ok) {
        const body = await evRes.json().catch(() => ({}));
        throw new Error(body.error || 'Could not load event');
      }
      const { event: ev } = await evRes.json();
      setEvent({ ...ev, starts_at_local: toLocal(ev.starts_at), ends_at_local: toLocal(ev.ends_at) });

      const [{ data: ts }, { data: sus }, { data: rs }] = await Promise.all([
        supabase.from('tasks').select('*').eq('event_id', id).order('created_at'),
        supabase.from('volunteer_signups').select('*').eq('event_id', id),
        supabase.from('event_rsvps').select('*').eq('event_id', id),
      ]);
      setTasks(ts || []);
      setSignups(sus || []);
      setRsvps(rs || []);

      const allProfileIds = [
        ...new Set([...(sus || []).map((s) => s.profile_id), ...(rs || []).map((r) => r.profile_id)]),
      ];
      if (allProfileIds.length) {
        const { data: pfs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allProfileIds);
        const map = {};
        (pfs || []).forEach((p) => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (err) {
      console.error('Manage event load failed', err);
      setLoadError(err?.message || 'Could not load event. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id, supabase, router]);

  useEffect(() => { load(); }, [load]);

  async function saveEvent(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: event.title,
        description: event.description || null,
        location: event.location || null,
        cover_image: event.cover_image || null,
        visibility: event.visibility || 'public',
        club_id: event.club_id || null,
        starts_at: new Date(event.starts_at_local).toISOString(),
        ends_at: event.ends_at_local ? new Date(event.ends_at_local).toISOString() : null,
      };
      const res = await fetch(`/api/organizer/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not save event');
      toast.success('Event updated');
    } catch (err) {
      toast.error(err.message || 'Could not save event');
    } finally {
      setSaving(false);
    }
  }

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    try {
      const res = await fetch(`/api/organizer/events/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description || null,
          volunteers_needed: Number(newTask.volunteers_needed) || 1,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not add task');
      toast.success('Task added');
      setNewTask({ title: '', description: '', volunteers_needed: 1 });
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not add task');
    }
  }

  async function deleteTask(taskId) {
    const response = await fetch(`/api/organizer/events/${id}/tasks?taskId=${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.error) toast.error(result.error);
    else { toast.success('Task deleted'); load(); }
  }

  async function removeVolunteer(signupId) {
    const { error } = await supabase.from('volunteer_signups').delete().eq('id', signupId);
    if (error) toast.error('Could not remove volunteer');
    else { toast.success('Volunteer removed'); load(); }
  }

  async function sendAnnouncement(e) {
    e.preventDefault();
    if (!announcement.message.trim()) return;
    setSendingAnnouncement(true);
    try {
      const res = await fetch(`/api/organizer/events/${id}/announcement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(announcement),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not send announcement');
      toast.success(body.sent ? `Announcement sent to ${body.sent} participant${body.sent === 1 ? '' : 's'}` : body.message);
      setAnnouncement({ ...announcement, message: '' });
    } catch (err) {
      toast.error(err.message || 'Could not send announcement');
    } finally {
      setSendingAnnouncement(false);
    }
  }

  // ── Loading state
  if (loading) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // ── Error state (BUG-002 fix: was previously swallowed by loading || !event)
  if (loadError) {
    return (
      <div className="container max-w-2xl py-16">
        <ErrorState
          title="Could not load event"
          description={loadError}
          onRetry={load}
        />
        <div className="mt-4 text-center">
          <Link href="/dashboard/organizer">
            <Button variant="outline">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Not found state
  if (!event) {
    return (
      <div className="container max-w-2xl py-16">
        <EmptyState
          title="Event not found"
          description="This event does not exist or you do not have permission to manage it."
          action={<Link href="/dashboard/organizer"><Button variant="outline">Back to dashboard</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-4xl animate-in-up">
      <Link href="/dashboard/organizer" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Manage event</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const rows = signups.map((s) => {
                const p = profiles[s.profile_id];
                const t = tasks.find((tt) => tt.id === s.task_id);
                return { name: p?.full_name || '', email: p?.email || '', task: t?.title || '', signed_up_at: s.signed_up_at };
              });
              if (!rows.length) { toast.error('No volunteers yet'); return; }
              downloadCSV(rows, `${event.title.replace(/\s+/g, '_')}_volunteers.csv`);
            }}
          >
            <Download className="w-4 h-4" /> Volunteers CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const rows = rsvps.map((r) => {
                const p = profiles[r.profile_id];
                return { name: p?.full_name || '', email: p?.email || '', rsvp_date: r.created_at };
              });
              if (!rows.length) { toast.error('No RSVPs yet'); return; }
              downloadCSV(rows, `${event.title.replace(/\s+/g, '_')}_attendees.csv`);
            }}
          >
            <Download className="w-4 h-4" /> Attendees CSV
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Event details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveEvent} className="space-y-4">
            <div>
              <Label htmlFor="ev-title">Title</Label>
              <Input id="ev-title" value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="ev-desc">Description</Label>
              <Textarea id="ev-desc" rows={3} value={event.description || ''} onChange={(e) => setEvent({ ...event, description: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="ev-loc">Location</Label>
              <Input id="ev-loc" value={event.location || ''} onChange={(e) => setEvent({ ...event, location: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ev-starts">Starts</Label>
                <Input id="ev-starts" type="datetime-local" value={event.starts_at_local} onChange={(e) => setEvent({ ...event, starts_at_local: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="ev-ends">Ends</Label>
                <Input id="ev-ends" type="datetime-local" value={event.ends_at_local} onChange={(e) => setEvent({ ...event, ends_at_local: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Cover image</Label>
              <ImageUpload value={event.cover_image} onChange={(url) => setEvent({ ...event, cover_image: url })} />
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${(event.visibility || 'public') === 'public' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="edit-vis" value="public" checked={(event.visibility || 'public') === 'public'} onChange={() => setEvent({ ...event, visibility: 'public' })} className="mt-1" />
                  <div><div className="font-medium text-sm">Public</div><div className="text-xs text-muted-foreground">Anyone can see.</div></div>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${event.visibility === 'club_only' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="edit-vis" value="club_only" checked={event.visibility === 'club_only'} onChange={() => setEvent({ ...event, visibility: 'club_only' })} className="mt-1" />
                  <div><div className="font-medium text-sm">Club only</div><div className="text-xs text-muted-foreground">Members only.</div></div>
                </label>
              </div>
            </div>
            <Button type="submit" disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" aria-hidden="true" /> Send announcement
          </CardTitle>
          <p className="text-sm text-muted-foreground">Notify people who RSVP’d or volunteered for this event.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendAnnouncement} className="space-y-4">
            <div>
              <Label htmlFor="announcement-audience">Recipients</Label>
              <select
                id="announcement-audience"
                value={announcement.audience}
                onChange={(e) => setAnnouncement({ ...announcement, audience: e.target.value })}
                className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="both">RSVP attendees and volunteers</option>
                <option value="attendees">RSVP attendees only</option>
                <option value="volunteers">Volunteers only</option>
              </select>
            </div>
            <div>
              <Label htmlFor="announcement-message">Message</Label>
              <Textarea
                id="announcement-message"
                rows={4}
                maxLength={1000}
                value={announcement.message}
                onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                placeholder="Share an arrival update, reminder, or important event information."
                required
              />
              <p className="mt-1 text-xs text-muted-foreground text-right">{announcement.message.length}/1000</p>
            </div>
            <Button type="submit" disabled={sendingAnnouncement || !announcement.message.trim()} className="gap-2">
              <Send className="h-4 w-4" aria-hidden="true" />
              {sendingAnnouncement ? 'Sending…' : 'Send announcement'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Add a volunteer task</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addTask} className="space-y-3">
            <div>
              <Label htmlFor="task-title">Task title</Label>
              <Input id="task-title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Registration desk" required />
            </div>
            <div>
              <Label htmlFor="task-desc">Description</Label>
              <Textarea id="task-desc" rows={2} value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="task-vol">Volunteers needed</Label>
              <Input id="task-vol" type="number" min={1} max={1000} value={newTask.volunteers_needed} onChange={(e) => setNewTask({ ...newTask, volunteers_needed: e.target.value })} className="w-32" />
            </div>
            <Button type="submit" className="gap-2"><Plus className="w-4 h-4" /> Add task</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500 fill-current" aria-hidden="true" /> Attendees ({rsvps.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rsvps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No RSVPs yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              {rsvps.map((r) => {
                const p = profiles[r.profile_id];
                return (
                  <div key={r.id} className="flex items-center justify-between bg-muted/30 rounded px-3 py-2">
                    <span>
                      <span className="font-medium">{p?.full_name || 'Unknown'}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{p?.email}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), 'MMM d')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold mb-3">Tasks &amp; Volunteers</h2>
      {tasks.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No tasks yet.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const taskSignups = signups.filter((s) => s.task_id === task.id);
            return (
              <Card key={task.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{task.title}</h3>
                      {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="gap-1">
                          <Users className="w-3 h-3" aria-hidden="true" /> {taskSignups.length} / {task.volunteers_needed}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteTask(task.id)} className="text-destructive" aria-label={`Delete task: ${task.title}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {taskSignups.length > 0 && (
                    <div className="border-t pt-3 space-y-2">
                      {taskSignups.map((s) => {
                        const p = profiles[s.profile_id];
                        return (
                          <div key={s.id} className="flex items-center justify-between text-sm">
                            <span>
                              <span className="font-medium">{p?.full_name || 'Unknown'}</span>
                              <span className="text-muted-foreground ml-2">{p?.email}</span>
                              <span className="text-xs text-muted-foreground ml-2">signed up {format(new Date(s.signed_up_at), 'MMM d')}</span>
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => removeVolunteer(s.id)} className="text-destructive">Remove</Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ManageEventPage;
