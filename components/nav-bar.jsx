'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Sparkles, LogOut, LayoutDashboard, CalendarRange } from 'lucide-react';
import ThemeToggle from '@/components/theme-toggle';

export default function NavBar() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      if (data.user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
        setProfile(p);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        setProfile(p);
      } else {
        setProfile(null);
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase, pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span>Campus Pulse</span>
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/events">
            <Button variant="ghost" size="sm" className="gap-2">
              <CalendarRange className="w-4 h-4" /> Events
            </Button>
          </Link>
          {user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </Button>
              </Link>
              <span className="hidden sm:inline text-sm text-muted-foreground px-2">
                {profile?.full_name || user.email}
                {profile?.role && <span className="ml-1 text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">{profile.role}</span>}
              </span>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                <LogOut className="w-4 h-4" /> Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/sign-in">
                <Button variant="ghost" size="sm">Sign in</Button>
              </Link>
              <Link href="/auth/sign-up">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
