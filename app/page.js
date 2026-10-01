'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CalendarRange, Users, ClipboardList, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

const features = [
  {
    icon: CalendarRange,
    title: 'Discover events',
    description: 'Browse every hackathon, cultural night, sports match, and volunteer drive across campus — all in one place.',
  },
  {
    icon: ClipboardList,
    title: 'Volunteer with one click',
    description: 'Every event lists its tasks openly. Pick one that fits your schedule and skills.',
  },
  {
    icon: Users,
    title: 'Organize like a pro',
    description: 'Create events, post tasks, and see your volunteer roster in real time — no spreadsheets needed.',
  },
];

const benefits = [
  'No more chasing WhatsApp forwards',
  'Discover member-only club events',
  'Track your volunteering history',
  'Organizers get real-time signups',
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero — negative margin pulls it behind the floating navbar */}
      <section className="relative overflow-hidden -mt-[68px] pt-[68px]">
        {/* Atmospheric green glow — extends the full height including behind the navbar */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-5%,hsl(var(--primary)/0.10),transparent_70%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_80%_0%,hsl(var(--primary)/0.06),transparent_60%)] pointer-events-none" />
        <div className="container relative py-20 md:py-28 lg:py-36">
          <div className="max-w-2xl animate-in-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Built for student communities
            </div>
            <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl leading-[1.1]">
              Your campus,<br />
              <span className="text-primary">one heartbeat away.</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground leading-relaxed max-w-xl">
              Discover events, sign up as a volunteer, and manage club activities — all in one place.
              No more chasing WhatsApp forwards.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/auth/sign-up">
                <Button size="lg" className="gap-2 shadow-sm">
                  Get started free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/events">
                <Button size="lg" variant="outline">Browse events</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20">
        <div className="mb-12 max-w-xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Platform</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything campus life needs</h2>
          <p className="mt-3 text-muted-foreground">One platform for students, organizers, and clubs.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 animate-stagger">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-border/70 bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y border-border/50 bg-muted/30">
        <div className="container py-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Why Campus Pulse</p>
              <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Designed for real campus life</h2>
              <p className="text-muted-foreground leading-relaxed">
                We built Campus Pulse after watching students miss events because the info was buried in group chats.
                Now everything lives in one searchable, organized place.
              </p>
            </div>
            <ul className="space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20">
        <div className="rounded-2xl border border-border bg-card p-10 md:p-14 text-center shadow-sm">
          <div className="mx-auto max-w-lg">
            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">Ready to feel the pulse?</h2>
            <p className="mb-7 text-muted-foreground">Sign up in 30 seconds. Students find events. Organizers rally volunteers. Everyone wins.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/auth/sign-up">
                <Button size="lg" className="gap-2">
                  Create your account <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/events">
                <Button size="lg" variant="outline">View events</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3 w-3" />
            </div>
            <span className="font-medium text-foreground">Campus Pulse</span>
          </div>
          <p>Campus management for the next generation of students.</p>
        </div>
      </footer>
    </div>
  );
}
