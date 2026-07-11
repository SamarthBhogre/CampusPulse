'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { MailCheck, ArrowLeft } from 'lucide-react';

function ForgotPasswordPage() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      toast.error(err.message || 'Could not send reset link');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container max-w-md py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>Enter your email and we’ll send you a link to set a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <MailCheck className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Check your inbox</h3>
              <p className="text-sm text-muted-foreground mb-6">
                If an account exists for <span className="font-medium">{email}</span>, you’ll get a password reset link within a minute.
              </p>
              <Link href="/auth/sign-in" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campus.edu" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                Remembered it? <Link href="/auth/sign-in" className="text-primary hover:underline">Sign in</Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ForgotPasswordPage;
