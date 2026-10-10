'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bot, Send, X, Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const HIDDEN_ON = ['/auth', '/oauth', '/suspended'];
const STORAGE_KEY = 'campus-pulse-assistant';
const SUGGESTIONS = [
  'What events are coming up this week?',
  'Show my registrations',
  'Find volunteer tasks with open spots',
];
const ACTION_LABELS = {
  cancel_event_registration: 'Cancel registration',
  cancel_volunteer_signup: 'Leave volunteer task',
  update_event: 'Update event',
  cancel_event: 'Cancel event',
  send_event_announcement: 'Send announcement',
  moderate_event: 'Moderate event',
};

function loadStored() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveStored(messages) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* storage unavailable */ }
}

/** Flattens a tool preview into readable label/value rows. */
function previewRows(preview) {
  if (!preview || typeof preview !== 'object') return [];
  return Object.entries(preview).flatMap(([key, value]) => {
    const label = key.replace(/_/g, ' ');
    if (value == null) return [];
    if (typeof value !== 'object') return [[label, String(value)]];
    if (value.title || value.name) return [[label, value.title || value.name]];
    return Object.entries(value)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => [`${label}: ${k.replace(/_/g, ' ')}`, String(v)]);
  });
}

function PendingActionCard({ action, onResolve }) {
  const [state, setState] = useState(action.state || 'pending');

  async function confirm() {
    setState('running');
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: { tool: action.tool, arguments: action.arguments } }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    const ok = Boolean(res?.ok && body?.ok);
    setState(ok ? 'done' : 'failed');
    onResolve(ok ? 'done' : 'failed', body?.message || body?.error || 'The action failed.');
  }

  function dismiss() {
    setState('dismissed');
    onResolve('dismissed', 'Okay, I did not do it.');
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <p className="mb-1.5 font-semibold text-foreground">{ACTION_LABELS[action.tool] || action.tool}?</p>
      <dl className="mb-2.5 space-y-0.5">
        {previewRows(action.preview).map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <dt className="shrink-0 capitalize text-muted-foreground">{label}:</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {state === 'pending' && (
        <div className="flex gap-2">
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={confirm}><Check className="h-3 w-3" /> Confirm</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={dismiss}>Cancel</Button>
        </div>
      )}
      {state === 'running' && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Working…</p>}
      {state === 'done' && <p className="font-medium text-emerald-600">Confirmed</p>}
      {state === 'failed' && <p className="font-medium text-destructive">Failed</p>}
      {state === 'dismissed' && <p className="text-muted-foreground">Not done</p>}
    </div>
  );
}

export default function AssistantWidget() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
      if (!session?.user) { setMessages([]); saveStored([]); }
    });
    setMessages(loadStored());
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { saveStored(messages); }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open, busy]);

  if (!signedIn || HIDDEN_ON.some((prefix) => pathname?.startsWith(prefix))) return null;

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.filter((m) => m.text).map(({ role, text: t }) => ({ role, text: t }));
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The assistant could not answer.');
      setMessages((current) => [...current, { role: 'assistant', text: body.reply, actions: body.pendingActions || [] }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', text: error.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function resolveAction(messageIndex, actionIndex, state, note) {
    setMessages((current) => {
      const next = current.map((m, i) => (i !== messageIndex ? m : {
        ...m,
        actions: m.actions.map((a, j) => (j === actionIndex ? { ...a, state } : a)),
      }));
      return [...next, { role: 'assistant', text: note, error: state === 'failed' }];
    });
  }

  return (
    <div className="fixed right-4 z-50 flex flex-col items-end gap-3" style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
      {open && (
        <div className="flex h-[min(560px,calc(100vh-7rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl animate-in-up" role="dialog" aria-label="CampusPulse assistant">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Sparkles className="h-3.5 w-3.5" /></div>
              <div>
                <p className="text-sm font-semibold leading-tight">Campus assistant</p>
                <p className="text-[11px] text-muted-foreground">Powered by AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setMessages([])}>Clear</Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close assistant"><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-2 py-2">
                <p className="text-muted-foreground">Ask me about events and volunteering, or let me register you. I&apos;ll always ask before cancelling anything.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted">{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[88%] rounded-2xl px-3 py-2',
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : m.error ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                )}>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  {m.actions?.map((action, j) => (
                    <PendingActionCard key={j} action={action} onResolve={(state, note) => resolveAction(i, j, state, note)} />
                  ))}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…</div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2 border-t p-3">
            <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
            <textarea
              id="assistant-input"
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about events…"
              className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" className="h-[38px] w-[38px] shrink-0" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
      <Button
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-12 rounded-full shadow-lg"
        size="icon"
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </Button>
    </div>
  );
}
