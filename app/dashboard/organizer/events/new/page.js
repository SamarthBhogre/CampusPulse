'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import ImageUpload from '@/components/image-upload';
import { ArrowLeft } from 'lucide-react';

function NewEventPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', location: '', starts_at: '', ends_at: '',
    cover_image: '', club_id: '', visibility: 'public', max_attendees: '',
  });

  useEffect(() => {
    supabase.from('clubs').select('*').order('name').then(({ data }) => setClubs(data || []));
  }, [supabase]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        cover_image: form.cover_image || null,
        club_id: form.club_id || null,
        visibility: form.visibility,
        max_attendees: form.max_attendees === '' ? null : Number(form.max_attendees),
      };
      const res = await fetch('/api/organizer/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not create event');
      toast.success('Event created!');
      router.push(`/dashboard/organizer/events/${body.event.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-2xl py-8 animate-in-up">
      <Link href="/dashboard/organizer" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>
      <Card className="shadow-sm">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Organizer tools</p>
          <CardTitle className="text-2xl font-bold tracking-tight">Create a new event</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Event title</Label>
              <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="HackNight 2025" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is it about?" />
            </div>
            <div className="space-y-2">
              <Label>Club</Label>
              <Select value={form.club_id} onValueChange={(v) => setForm({ ...form, club_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select a club (optional)" /></SelectTrigger>
                <SelectContent>
                  {clubs.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc">Location</Label>
              <Input id="loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Main Auditorium" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start">Starts</Label>
                <Input id="start" type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Ends</Label>
                <Input id="end" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-attendees">Attendee limit</Label>
              <Input id="max-attendees" type="number" min={1} max={100000} value={form.max_attendees} onChange={(e) => setForm({ ...form, max_attendees: e.target.value })} placeholder="Unlimited" className="w-40" />
              <p className="text-xs text-muted-foreground">Leave blank for no limit. Registrations close automatically once the limit is reached.</p>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${form.visibility === 'public' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="visibility" value="public" checked={form.visibility === 'public'} onChange={() => setForm({ ...form, visibility: 'public' })} className="mt-1" />
                  <div>
                    <div className="font-medium text-sm">Public</div>
                    <div className="text-xs text-muted-foreground">Anyone can see and RSVP.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${form.visibility === 'club_only' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" name="visibility" value="club_only" checked={form.visibility === 'club_only'} onChange={() => setForm({ ...form, visibility: 'club_only' })} className="mt-1" />
                  <div>
                    <div className="font-medium text-sm">Club only</div>
                    <div className="text-xs text-muted-foreground">Only club members can see this event.</div>
                  </div>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover">Cover image</Label>
              <ImageUpload value={form.cover_image} onChange={(url) => setForm({ ...form, cover_image: url })} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create event'}</Button>
              <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default NewEventPage;
