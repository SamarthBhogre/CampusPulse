'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureCurrentProfile } from '@/lib/profile';
import { Sparkles, LogOut, LayoutDashboard, CalendarRange, Users } from 'lucide-react';
import ThemeToggle from '@/components/theme-toggle';

export default function NavBar() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let mounted = true;

    async function loadProfile(sessionUser) {
      if (!mounted) return;
      setUser(sessionUser);
      if (!sessionUser) {
        setProfile(null);
        return;
      }

      try {
        const repairedProfile = await ensureCurrentProfile();
        if (mounted) setProfile(repairedProfile);
      } catch (err) {
        console.error('Profile load failed', err);
        if (mounted) {
          setProfile({
            full_name: sessionUser.user_metadata?.full_name || sessionUser.email,
            role: null,
          });
        }
      }
    }

    supabase.auth.getUser().then(({ data }) => loadProfile(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      await loadProfile(session?.user ?? null);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase, pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  const dashboardHref = profile?.role === 'organizer' ? '/dashboard/organizer' : '/dashboard';

  if (pathname?.startsWith('/admin')) {
    return null;
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
          <Link href="/clubs">
            <Button variant="ghost" size="sm" className="gap-2">
              <Users className="w-4 h-4" /> Clubs
            </Button>
          </Link>
          {user ? (
            <>
              <Link href={dashboardHref}>
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
