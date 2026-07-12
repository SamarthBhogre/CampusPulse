'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function AdminSignInPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (error) throw error;

      const res = await fetch('/api/admin/me', { cache: 'no-store' });
      if (!res.ok) {
        await supabase.auth.signOut();
        throw new Error('This account does not have admin access.');
      }

      router.push('/admin/dashboard');
      router.refresh();
    } catch (err) {
      toast.error(err?.message || 'Admin sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="-mt-16 min-h-screen bg-muted/30 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Campus Pulse
        </Link>
        <Card>
          <CardHeader>
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl">Admin sign in</CardTitle>
            <CardDescription>Use an approved administrator account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@campus.edu" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input id="admin-password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <Button className="w-full" disabled={loading}>
                {loading ? 'Checking access...' : 'Enter admin dashboard'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
