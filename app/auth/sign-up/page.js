'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getAuthRedirectUrl } from '@/lib/app-url';
import { GraduationCap, Megaphone, MailCheck, ArrowLeft } from 'lucide-react';

function SignUpPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', account_type: 'student', organization_name: '', organization_type: '', organization_website: '', organization_description: '', organizer_experience: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const nextPath = form.account_type === 'organizer' ? '/organizer/status' : '/dashboard';
      const emailRedirectTo = getAuthRedirectUrl(nextPath);
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.full_name.trim(),
            username: form.username.trim().toLowerCase(),
            requested_role: form.account_type,
            organizer_org_name: form.organization_name.trim(),
            organizer_org_type: form.organization_type,
            organizer_org_website: form.organization_website.trim(),
            organizer_org_description: form.organization_description.trim(),
            organizer_experience: form.organizer_experience.trim(),
          },
          emailRedirectTo,
        },
      });
      if (error) throw error;
      if (data.session) {
        toast.success('Welcome to Campus Pulse!');
        router.push('/dashboard');
        router.refresh();
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      toast.error(err.message || 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <div className="container max-w-md py-16">
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Check your inbox</h2>
            <p className="text-muted-foreground mb-6">
              We sent a confirmation link to <span className="font-medium text-foreground">{form.email}</span>.
              Click it to activate your account.
            </p>
            <Link href="/auth/sign-in" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-md py-16">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join Campus Pulse in 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ada Lovelace" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_.-]+" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="yourhandle" />
              <p className="text-xs text-muted-foreground">3–30 characters: letters, numbers, underscores, hyphens, or periods.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@campus.edu" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
            </div>
            <div className="space-y-2">
              <Label>Account type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_type: 'student' })}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${form.account_type === 'student' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                >
                  <GraduationCap className="w-5 h-5 text-primary mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Student</span>
                    <span className="block text-xs text-muted-foreground mt-1">Browse, RSVP, and volunteer.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, account_type: 'organizer' })}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${form.account_type === 'organizer' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                >
                  <Megaphone className="w-5 h-5 text-primary mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">Organizer</span>
                    <span className="block text-xs text-muted-foreground mt-1">Request event management access.</span>
                  </span>
                </button>
              </div>
              {form.account_type === 'organizer' && (
                <div className="mt-4 space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs text-muted-foreground">Organizer access requires a short review. Please provide enough information for an administrator to verify your request.</p>
                  <div className="space-y-2"><Label htmlFor="organization_name">Organization / company name</Label><Input id="organization_name" required value={form.organization_name} onChange={(e) => setForm({ ...form, organization_name: e.target.value })} placeholder="e.g. Computer Science Society" /></div>
                  <div className="space-y-2"><Label htmlFor="organization_type">Organization type</Label><select id="organization_type" required value={form.organization_type} onChange={(e) => setForm({ ...form, organization_type: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select type</option><option>Student club</option><option>College department</option><option>Company</option><option>Non-profit</option><option>Community group</option><option>Other</option></select></div>
                  <div className="space-y-2"><Label htmlFor="organization_website">Public website or profile (optional)</Label><Input id="organization_website" type="url" value={form.organization_website} onChange={(e) => setForm({ ...form, organization_website: e.target.value })} placeholder="https://..." /></div>
                  <div className="space-y-2"><Label htmlFor="organization_description">What does the organization do?</Label><textarea id="organization_description" required minLength={20} rows={3} value={form.organization_description} onChange={(e) => setForm({ ...form, organization_description: e.target.value })} placeholder="Describe your organization and the events you plan to host." className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div>
                  <div className="space-y-2"><Label htmlFor="organizer_experience">Relevant organizing experience</Label><textarea id="organizer_experience" required minLength={10} rows={3} value={form.organizer_experience} onChange={(e) => setForm({ ...form, organizer_experience: e.target.value })} placeholder="Tell us about events or communities you have organized." className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" /></div>
                </div>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account? <Link href="/auth/sign-in" className="text-primary hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default SignUpPage;
