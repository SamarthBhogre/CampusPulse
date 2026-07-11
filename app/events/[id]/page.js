'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calendar, MapPin, Users, ArrowLeft, CheckCircle2, Heart, Lock } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

function EventDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [event, setEvent] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [signups, setSignups] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);

  async function load() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      const { data: ev } = await supabase.from('events').select('*, clubs(name), profiles!events_created_by_fkey(full_name)').eq('id', id).maybeSingle();
      setEvent(ev);
      const { data: ts } = await supabase.from('tasks').select('*').eq('event_id', id).order('created_at');
      setTasks(ts || []);
      const { data: sus } = await supabase.from('volunteer_signups').select('*').eq('event_id', id);
      setSignups(sus || []);
      const { data: rs } = await supabase.from('event_rsvps').select('*').eq('event_id', id);
      setRsvps(rs || []);
    } catch (err) {
      console.error('Event detail load failed', err);
      toast.error(err?.message || 'Failed to load event');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const myRsvp = user ? rsvps.find((r) => r.profile_id === user.id) : null;

  async function toggleRsvp() {
    if (!user) { toast.error('Please sign in to RSVP'); router.push('/auth/sign-in'); return; }
    setRsvpBusy(true);
    try {
      if (myRsvp) {
        const { error } = await supabase.from('event_rsvps').delete().eq('id', myRsvp.id);
        if (error) throw error;
        toast.success('RSVP removed');
      } else {
        const { error } = await supabase.from('event_rsvps').insert({ event_id: id, profile_id: user.id });
        if (error) throw error;
        toast.success('You\'re attending! 🎉');
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRsvpBusy(false);
    }
  }

  async function volunteer(taskId) {
    if (!user) { toast.error('Please sign in to volunteer'); router.push('/auth/sign-in'); return; }
    setActionId(taskId);
    const { error } = await supabase.from('volunteer_signups').insert({ task_id: taskId, event_id: id, profile_id: user.id });
    if (error) toast.error(error.message);
    else { toast.success('You\'re signed up!'); await load(); }
    setActionId(null);
  }

  async function withdraw(signupId) {
    setActionId(signupId);
    const { error } = await supabase.from('volunteer_signups').delete().eq('id', signupId);
    if (error) toast.error(error.message);
    else { toast.success('Withdrawn from task'); await load(); }
    setActionId(null);
  }

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading…</div>;
  if (!event) return <div className="container py-16 text-center">Event not found.</div>;

  return (
    <div className="container py-8 max-w-4xl">
      <Link href="/events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to events
      </Link>

      {event.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.cover_image} alt={event.title} className="w-full aspect-[21/9] object-cover rounded-2xl mb-6" />
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {event.clubs?.name && <Badge variant="secondary">{event.clubs.name}</Badge>}
        {event.visibility === 'club_only' && <Badge variant="default" className="gap-1"><Lock className="w-3 h-3" /> Club only</Badge>}
        <span className="text-sm text-muted-foreground">Organized by {event.profiles?.full_name || 'Campus Pulse'}</span>
      </div>

      <h1 className="text-4xl font-bold mb-4">{event.title}</h1>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
        <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /> {format(new Date(event.starts_at), 'PPP • p')}</div>
        {event.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {event.location}</div>}
        <div className="flex items-center gap-2"><Heart className="w-4 h-4" /> {rsvps.length} attending</div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <Button
          onClick={toggleRsvp}
          disabled={rsvpBusy}
          variant={myRsvp ? 'secondary' : 'default'}
          size="lg"
          className="gap-2"
        >
          <Heart className={`w-4 h-4 ${myRsvp ? 'fill-current' : ''}`} />
          {rsvpBusy ? 'Saving…' : myRsvp ? 'You’re attending' : 'I’ll be there'}
        </Button>
        {tasks.length > 0 && (
          <a href="#tasks" className="inline-flex">
            <Button variant="outline" size="lg">See volunteer tasks ↓</Button>
          </a>
        )}
      </div>

      <p className="text-lg text-muted-foreground leading-relaxed mb-10 whitespace-pre-line">{event.description}</p>

      <h2 id="tasks" className="text-2xl font-bold mb-4">Volunteer Tasks</h2>
      {tasks.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No tasks posted yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const filled = signups.filter((s) => s.task_id === task.id).length;
            const mySignup = signups.find((s) => s.task_id === task.id && s.profile_id === user?.id);
            const isFull = filled >= task.volunteers_needed;
            return (
              <Card key={task.id}>
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{task.title}</h3>
                      {mySignup && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground mb-2">{task.description}</p>}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" /> {filled} / {task.volunteers_needed} volunteered
                    </div>
                  </div>
                  <div>
                    {mySignup ? (
                      <Button variant="outline" onClick={() => withdraw(mySignup.id)} disabled={actionId === mySignup.id}>
                        {actionId === mySignup.id ? 'Withdrawing…' : 'Withdraw'}
                      </Button>
                    ) : (
                      <Button onClick={() => volunteer(task.id)} disabled={isFull || actionId === task.id}>
                        {isFull ? 'Full' : actionId === task.id ? 'Signing up…' : 'Volunteer'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default EventDetailPage;
