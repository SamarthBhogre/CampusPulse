'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Clock3, ShieldAlert, Trash2, CheckCircle2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function OrganizerStatusPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { fetch('/api/organizer/status', { cache: 'no-store' }).then((res) => res.ok ? res.json() : null).then((data) => setProfile(data?.profile || null)).finally(() => setLoading(false)); }, []);

  async function deleteAccount() {
    setDeleting(true);
    const res = await fetch('/api/settings/delete-account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT', permanent: true }) });
    if (res.ok) { await supabase.auth.signOut(); router.replace('/'); router.refresh(); }
    else { setDeleting(false); window.alert('We could not delete the account. Please try again or contact support.'); }
  }

  if (loading) return <div className="container py-16 text-center text-muted-foreground">Loading your application…</div>;
  const rejected = profile?.organizer_request_status === 'rejected';
  const approved = profile?.role === 'organizer' && profile?.organizer_request_status === 'approved';
  if (approved) { router.replace('/dashboard/organizer'); return null; }
  return <div className="container max-w-2xl py-12 sm:py-20"><Card className="overflow-hidden"><div className={`h-2 ${rejected ? 'bg-destructive' : 'bg-primary'}`} /><CardHeader className="pt-8 text-center"><div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${rejected ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>{rejected ? <ShieldAlert className="h-7 w-7" /> : <Clock3 className="h-7 w-7" />}</div><CardTitle className="text-2xl">{rejected ? 'Organizer application not approved' : 'Your application is under review'}</CardTitle><CardDescription>{rejected ? 'The administrator could not approve your organizer access at this time.' : 'Thank you for applying. Please wait while an administrator reviews your information.'}</CardDescription></CardHeader><CardContent className="space-y-6 pb-8"><div className="rounded-lg border bg-muted/30 p-4 text-sm"><p className="font-medium">{profile?.organizer_org_name}</p><p className="mt-1 text-muted-foreground">{profile?.organizer_org_type}</p>{rejected && profile?.organizer_rejection_reason && <p className="mt-3 text-destructive">Reason: {profile.organizer_rejection_reason}</p>}</div>{rejected ? <div className="space-y-4"><p className="text-sm text-muted-foreground">You may continue browsing public events and clubs. If you no longer want this account, you can permanently delete your account and its associated data.</p><AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" className="w-full gap-2"><Trash2 className="h-4 w-4" /> Delete my account and data</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Permanently delete your account?</AlertDialogTitle><AlertDialogDescription>This removes your profile, organizer application, memberships, participation records, and account. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep account</AlertDialogCancel><AlertDialogAction onClick={deleteAccount} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete permanently'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div> : <><div className="flex items-start gap-3 rounded-lg bg-primary/5 p-4 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>While your application is being reviewed, you can browse events and clubs. Organizer tools will unlock automatically after approval.</p></div><Button asChild variant="outline" className="w-full"><Link href="/events">Browse events and clubs</Link></Button></>}</CardContent></Card></div>;
}
