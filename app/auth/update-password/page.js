'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Eye, EyeOff, KeyRound } from 'lucide-react';

function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Ensure we have a session (from the recovery link exchange)
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error('Reset link expired. Please request a new one.');
        router.replace('/auth/forgot-password');
        return;
      }
      setReady(true);
    });
  }, [supabase, router]);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success('Password updated! Redirecting…');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof TypeError ? 'Campus Pulse could not reach the password service. Check your connection and try again.' : 'Could not update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div className="container py-16 text-center text-muted-foreground">Verifying reset link…</div>;

  return (
    <div className="container max-w-md py-10 sm:py-16">
      <div className="mb-8 text-center"><div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><KeyRound className="h-5 w-5" /></div><p className="text-sm font-medium text-primary">Secure your account</p></div>
      <Card className="border-border/70 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>Choose a strong password you’ll remember.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <div className="relative"><Input id="pw" type={showPassword ? 'text' : 'password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" /><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpw">Confirm password</Label>
              <Input id="cpw" type={showPassword ? 'text' : 'password'} required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              <Link href="/auth/sign-in" className="text-primary hover:underline">Back to sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default UpdatePasswordPage;
