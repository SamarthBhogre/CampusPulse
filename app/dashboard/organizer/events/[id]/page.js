'use client';

import { useEffect, useState, use } from 'react';
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
import { ArrowLeft, Plus, Trash2, Save, Users } from 'lucide-react';
import { format } from 'date-fns';

function ManageEventPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [signups, setSignups] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [newTask, setNewTask] = useState({ title: '', description: '', volunteers_needed: 1 });

  async function load() {
    try {
      const { data: ev } = await supabase.from('events').select('*, clubs(name)').eq('id', id).maybeSingle();
      if (!ev) { toast.error('Event not found'); router.push('/dashboard/organizer'); return; }
      setEvent({ ...ev, starts_at_local: toLocal(ev.starts_at), ends_at_local: ev.ends_at ? toLocal(ev.ends_at) : '' });
      const { data: ts } = await supabase.from('tasks').select('*').eq('event_id', id).order('created_at');
      setTasks(ts || []);
      const { data: sus } = await supabase.from('volunteer_signups').select('*').eq('event_id', id);
      setSignups(sus || []);
      if (sus?.length) {
        const ids = [...new Set(sus.map((s) => s.profile_id))];
        const { data: pfs } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
        const map = {};
        (pfs || []).forEach((p) => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (err) {
      console.error('Manage event load failed', err);
      toast.error(err?.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  function toLocal(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function saveEvent(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: event.title,
      description: event.description,
      location: event.location,
      cover_image: event.cover_image,
      starts_at: new Date(event.starts_at_local).toISOString(),
      ends_at: event.ends_at_local ? new Date(event.ends_at_local).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('events').update(payload).eq('id', id);
    if (error) toast.error(error.message); else toast.success('Event updated');
    setSaving(false);
  }

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.title) return;
    const { error } = await supabase.from('tasks').insert({
      event_id: id, title: newTask.title, description: newTask.description, volunteers_needed: Number(newTask.volunteers_needed) || 1,
    });
    if (error) toast.error(error.message);
    else { toast.success('Task added'); setNewTask({ title: '', description: '', volunteers_needed: 1 }); load(); }
  }

  async function deleteTask(taskId) {
    if (!confirm('Delete this task and its volunteers?')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) toast.error(error.message); else { toast.success('Task deleted'); load(); }
  }

  async function removeVolunteer(signupId) {
    if (!confirm('Remove this volunteer from the task?')) return;
    const { error } = await supabase.from('volunteer_signups').delete().eq('id', signupId);
    if (error) toast.error(error.message); else { toast.success('Volunteer removed'); load(); }
  }

  if (loading || !event) return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="container py-8 max-w-4xl">
      <Link href="/dashboard/organizer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      <h1 className="text-3xl font-bold mb-6">Manage event</h1>

      <Card className="mb-6">
        <CardHeader><CardTitle>Event details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={saveEvent} className="space-y-4">
            <div><Label>Title</Label><Input value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={event.description || ''} onChange={(e) => setEvent({ ...event, description: e.target.value })} /></div>
            <div><Label>Location</Label><Input value={event.location || ''} onChange={(e) => setEvent({ ...event, location: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Starts</Label><Input type="datetime-local" value={event.starts_at_local} onChange={(e) => setEvent({ ...event, starts_at_local: e.target.value })} /></div>
              <div><Label>Ends</Label><Input type="datetime-local" value={event.ends_at_local} onChange={(e) => setEvent({ ...event, ends_at_local: e.target.value })} /></div>
            </div>
            <div><Label>Cover image</Label><ImageUpload value={event.cover_image} onChange={(url) => setEvent({ ...event, cover_image: url })} /></div>
            <Button type="submit" disabled={saving} className="gap-2"><Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Add a volunteer task</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addTask} className="space-y-3">
            <div><Label>Task title</Label><Input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="Registration desk" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} /></div>
            <div><Label>Volunteers needed</Label><Input type="number" min={1} value={newTask.volunteers_needed} onChange={(e) => setNewTask({ ...newTask, volunteers_needed: e.target.value })} className="w-32" /></div>
            <Button type="submit" className="gap-2"><Plus className="w-4 h-4" /> Add task</Button>
          </form>
        </CardContent>
      </Card>

      <h2 className="text-xl font-semibold mb-3">Tasks & Volunteers</h2>
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
                        <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" /> {taskSignups.length} / {task.volunteers_needed}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteTask(task.id)} className="text-destructive"><Trash2 className="w-4 h-4" /></Button>
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
