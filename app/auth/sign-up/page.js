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
  const [form, setForm] = useState({ full_name: '', email: '', password: '', account_type: 'student' });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const emailRedirectTo = getAuthRedirectUrl('/auth/confirm?next=/dashboard');
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            full_name: form.full_name.trim(),
            requested_role: form.account_type,
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
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join Campus Pulse in 30 seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ada Lovelace" />
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
                <p className="text-xs text-muted-foreground">
                  Organizer access needs admin approval after signup. Your account starts safely as a student.
                </p>
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
