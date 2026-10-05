'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck, LayoutDashboard, Users, Calendar, Building2,
  ClipboardList, BarChart3, Activity, LogOut,
  ChevronRight, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const navItems = [
  { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/dashboard/organizers', label: 'Organizers', icon: ShieldCheck, badge: 'pending' },
  { href: '/admin/dashboard/users', label: 'Users', icon: Users },
  { href: '/admin/dashboard/events', label: 'Events', icon: Calendar },
  { href: '/admin/dashboard/clubs', label: 'Clubs', icon: Building2 },
  { href: '/admin/dashboard/club-requests', label: 'Club Requests', icon: Building2 },
  { href: '/admin/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/dashboard/audit-log', label: 'Audit Log', icon: ClipboardList },
  { href: '/admin/dashboard/system-health', label: 'System Health', icon: Activity },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowserClient();
  const [admin, setAdmin] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);

  const checkAuth = useCallback(async () => {
    const res = await fetch('/api/admin/me', { cache: 'no-store' });
    if (res.status === 401) { router.replace('/admin/sign-in'); return; }
    if (res.ok) {
      const data = await res.json();
      setAdmin(data.profile);
    }
    // Load pending count for badge
    const statsRes = await fetch('/api/admin/stats', { cache: 'no-store' });
    if (statsRes.ok) {
      const { stats } = await statsRes.json();
      setPendingCount(stats?.pending_organizer_requests || 0);
    }
    setAuthChecked(true);
  }, [router]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/admin/sign-in');
  }

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="-mt-14 flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-background lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">CP Admin</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Admin navigation">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.badge === 'pending' && pendingCount > 0 && (
                  <Badge className="h-5 min-w-[1.25rem] justify-center px-1 text-xs">
                    {pendingCount}
                  </Badge>
                )}
                {active && <ChevronRight className="h-3 w-3 shrink-0" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 px-3 py-1">
            <p className="text-xs font-medium leading-none">{admin?.full_name || 'Admin'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground truncate">{admin?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Campus Pulse Admin</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
