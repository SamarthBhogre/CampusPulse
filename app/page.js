'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarRange, Users, ClipboardList, ArrowRight, Sparkles } from 'lucide-react';

function App() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-background pointer-events-none" />
        <div className="container relative py-24 md:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" /> Built for student communities
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
              Your campus,<br />
              <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                one heartbeat away.
              </span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              Discover events, sign up as a volunteer, and manage club activities — all in one place. 
              Stop chasing WhatsApp forwards.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/auth/sign-up">
                <Button size="lg" className="gap-2">
                  Get started free <ArrowRight className="w-4 h-4" />
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
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <CalendarRange className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Discover events</h3>
              <p className="text-sm text-muted-foreground">Browse every hackathon, cultural night, sports match, and volunteer drive across campus.</p>
            </CardContent>
          </Card>
          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <ClipboardList className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Volunteer with one click</h3>
              <p className="text-sm text-muted-foreground">Every event lists its tasks openly. Pick one that fits your schedule and skills, and you’re in.</p>
            </CardContent>
          </Card>
          <Card className="border-border hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Organize like a pro</h3>
              <p className="text-sm text-muted-foreground">Create events, post tasks, and see your volunteer roster in real time — no spreadsheets needed.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-purple-600 p-10 md:p-16 text-primary-foreground">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Ready to feel the pulse?</h2>
          <p className="opacity-90 mb-6 max-w-xl">Sign up in 30 seconds. Students find events. Organizers rally volunteers. Everyone wins.</p>
          <Link href="/auth/sign-up">
            <Button size="lg" variant="secondary" className="gap-2">
              Create your account <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default App;
