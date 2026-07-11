'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { GraduationCap, Megaphone } from 'lucide-react';

function SignUpPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'student' });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { full_name: form.full_name, role: form.role },
        },
      });
      if (error) throw error;
      if (data.session) {
        toast.success('Welcome to Campus Pulse!');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.success('Account created! Check your email to confirm, then sign in.');
        router.push('/auth/sign-in');
      }
    } catch (err) {
      toast.error(err.message || 'Sign-up failed');
    } finally {
      setLoading(false);
    }
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
              <Input id="password" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" />
            </div>
            <div className="space-y-2">
              <Label>I am a…</Label>
              <RadioGroup value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} className="grid grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition ${form.role === 'student' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <RadioGroupItem value="student" />
                  <GraduationCap className="w-4 h-4" />
                  <span className="text-sm font-medium">Student</span>
                </label>
                <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition ${form.role === 'organizer' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <RadioGroupItem value="organizer" />
                  <Megaphone className="w-4 h-4" />
                  <span className="text-sm font-medium">Organizer</span>
                </label>
              </RadioGroup>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
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
