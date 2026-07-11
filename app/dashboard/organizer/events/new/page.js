'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import ImageUpload from '@/components/image-upload';

function NewEventPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [clubs, setClubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', location: '', starts_at: '', ends_at: '',
    cover_image: '', club_id: '',
  });

  useEffect(() => {
    supabase.from('clubs').select('*').order('name').then(({ data }) => setClubs(data || []));
  }, [supabase]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        cover_image: form.cover_image || null,
        club_id: form.club_id || null,
        created_by: user.id,
      };
      const { data, error } = await supabase.from('events').insert(payload).select().single();
      if (error) throw error;
      toast.success('Event created!');
      router.push(`/dashboard/organizer/events/${data.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader><CardTitle className="text-2xl">Create a new event</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
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
