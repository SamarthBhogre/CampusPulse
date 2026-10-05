'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/page-header';

export default function ClubRequestPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/auth/sign-in?next=/clubs/request');
      else fetch('/api/clubs/requests').then((res) => res.ok ? res.json() : { requests: [] }).then((data) => setRequests(data.requests || []));
    });
  }, [router, supabase]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/clubs/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not submit request');
      toast.success('Club request submitted for review');
      setName(''); setDescription('');
      setRequests((current) => [body.request, ...current]);
    } catch (error) { toast.error(error.message); } finally { setBusy(false); }
  }

  return (
    <div className="container max-w-3xl py-8 sm:py-10">
      <Link href="/clubs" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to clubs</Link>
      <PageHeader eyebrow="Start a community" title="Propose a new club" description="Your request will be reviewed by an administrator. If approved, you become the club’s first manager and member." />
      <Card className="mt-8">
        <CardHeader><CardTitle>Club details</CardTitle><CardDescription>Use a clear name and explain what students will do together.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="club-name">Club name</Label><Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={100} required placeholder="e.g. Campus Makers Guild" /></div>
            <div className="space-y-2"><Label htmlFor="club-description">Description</Label><textarea id="club-description" value={description} onChange={(e) => setDescription(e.target.value)} minLength={10} maxLength={1000} required rows={5} placeholder="What is the club about? What activities will it run?" className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div>
            <Button type="submit" disabled={busy} className="gap-2"> <Send className="h-4 w-4" /> {busy ? 'Submitting…' : 'Submit for review'}</Button>
          </form>
        </CardContent>
      </Card>
      {requests.length > 0 && <Card className="mt-6"><CardHeader><CardTitle>Your requests</CardTitle></CardHeader><CardContent className="space-y-3">{requests.map((request) => <div key={request.id} className="flex items-start justify-between gap-4 rounded-lg border p-3"><div><p className="font-medium">{request.name}</p><p className="text-sm text-muted-foreground">{request.description}</p>{request.rejection_reason && <p className="mt-1 text-sm text-destructive">Reason: {request.rejection_reason}</p>}</div><span className="text-xs font-medium capitalize text-muted-foreground">{request.status}</span></div>)}</CardContent></Card>}
    </div>
  );
}
