'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ensureCurrentProfile } from '@/lib/profile';
import { Sparkles, LogOut, LayoutDashboard, CalendarRange, Users, Menu, Settings, Bell } from 'lucide-react';
import ThemeToggle from '@/components/theme-toggle';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function NavLink({ href, label, icon: Icon, pathname }) {
  const isActive = pathname === href || pathname?.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

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
      if (!sessionUser) { setProfile(null); return; }
      try {
        const p = await ensureCurrentProfile();
        if (mounted) setProfile(p);
      } catch (err) {
        console.error('Profile load failed', err);
        if (mounted) setProfile({ full_name: sessionUser.user_metadata?.full_name || sessionUser.email, role: null });
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

  if (pathname?.startsWith('/admin')) return null;

  const dashboardHref = profile?.role === 'organizer' ? '/dashboard/organizer' : '/dashboard';

  const navLinks = [
    { href: '/events', label: 'Events', icon: CalendarRange },
    { href: '/clubs', label: 'Clubs', icon: Users },
  ];

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  return (
    /* Outer fixed strip — full width, transparent */
    <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-center px-4 py-2.5">
      {/* Pill container — Chrome address-bar shape, proper height */}
      <div
        className={cn(
          'flex h-12 w-full max-w-5xl items-center gap-2 rounded-full px-3',
          'border border-border/60 bg-background/88 backdrop-blur-xl',
          'shadow-sm shadow-black/5 dark:shadow-black/25',
          'transition-shadow duration-200'
        )}
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full px-1.5 py-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Campus Pulse home"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-3 w-3" />
          </div>
          <span className="hidden font-bold text-sm tracking-tight sm:block">Campus Pulse</span>
        </Link>

        {/* Separator */}
        <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden="true" />

        {/* Desktop nav links */}
        <nav className="hidden flex-1 items-center gap-0.5 md:flex" aria-label="Primary navigation">
          {navLinks.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} icon={icon} pathname={pathname} />
          ))}
          {user && (
            <NavLink href={dashboardHref} label="Dashboard" icon={LayoutDashboard} pathname={pathname} />
          )}
        </nav>

        {/* Spacer on mobile */}
        <div className="flex-1 md:hidden" />

        {/* Right side actions */}
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />

          {/* Desktop user / auth */}
          <div className="hidden items-center gap-1 md:flex">
            {user ? (
              <>
                {/* Thin separator */}
                <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
                {/* Avatar */}
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold dark:bg-primary/15"
                  aria-hidden="true"
                >
                  {initials}
                </div>
                <span className="hidden min-w-0 max-w-44 truncate text-sm text-muted-foreground lg:block">
                  {profile?.full_name?.split(' ')[0] || user.email}
                  {profile?.role && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                      {profile.role}
                    </span>
                  )}
                </span>
                <Link href="/notifications" aria-label="Notifications" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Bell className="h-3.5 w-3.5" />
                </Link>
                <Link href="/settings" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Settings className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={signOut}
                  aria-label="Sign out"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />
                <Link href="/auth/sign-in">
                  <button className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Sign in
                  </button>
                </Link>
                <Link href="/auth/sign-up">
                  <button className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
                    Get started
                  </button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  aria-label="Open navigation menu"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Menu className="h-4.5 w-4.5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(88vw,300px)] p-0">
                <div className="flex flex-col h-full">
                  <SheetHeader className="px-5 pt-5 pb-4 border-b">
                    <SheetTitle className="flex items-center gap-2.5 text-base font-bold">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      Campus Pulse
                    </SheetTitle>
                  </SheetHeader>

                  <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Mobile navigation">
                    {navLinks.map(({ href, label, icon: Icon }) => {
                      const isActive = pathname === href || pathname?.startsWith(href + '/');
                      return (
                        <SheetClose asChild key={href}>
                          <Link
                            href={href}
                            className={cn(
                              'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                              isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                    {user && (
                      <SheetClose asChild>
                        <Link
                          href={dashboardHref}
                          className={cn(
                            'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                            pathname?.startsWith('/dashboard') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          )}
                        >
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                        </Link>
                      </SheetClose>
                    )}
                  </nav>

                  <div className="px-5 py-4 border-t mt-auto">
                    {user ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{profile?.full_name || user.email}</p>
                            {profile?.role && <p className="text-xs text-muted-foreground capitalize">{profile.role}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <SheetClose asChild>
                            <Link href="/notifications" className="w-full">
                              <Button variant="ghost" className="w-full justify-start gap-2 rounded-xl">
                                <Bell className="h-4 w-4" /> Notifications
                              </Button>
                            </Link>
                          </SheetClose>
                          <SheetClose asChild>
                            <Link href="/settings" className="w-full">
                              <Button variant="ghost" className="w-full justify-start gap-2 rounded-xl">
                                <Settings className="h-4 w-4" /> Account Settings
                              </Button>
                            </Link>
                          </SheetClose>
                          <Button variant="outline" className="w-full justify-start gap-2 rounded-xl" onClick={signOut}>
                            <LogOut className="h-4 w-4" /> Sign out
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <SheetClose asChild>
                          <Link href="/auth/sign-in">
                            <Button variant="outline" className="w-full rounded-xl">Sign in</Button>
                          </Link>
                        </SheetClose>
                        <SheetClose asChild>
                          <Link href="/auth/sign-up">
                            <Button className="w-full rounded-xl">Get started</Button>
                          </Link>
                        </SheetClose>
                      </div>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
