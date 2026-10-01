'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { User, Bell, Shield, Trash2, CheckCircle2, AtSign, Mail, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [profile, setProfile] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  // Notification prefs state
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Delete account state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, prefsRes] = await Promise.all([
        fetch('/api/settings/profile'),
        fetch('/api/settings/notifications'),
      ]);
      if (!profileRes.ok) { router.push('/auth/sign-in'); return; }
      const profileData = await profileRes.json();
      const prefsData = prefsRes.ok ? await prefsRes.json() : { preferences: null };

      setProfile(profileData.profile);
      setDisplayName(profileData.profile?.full_name || '');
      setUsername(profileData.profile?.username || '');
      setPrefs(prefsData.preferences || {
        email_rsvp_confirmation: true,
        email_volunteer_confirmation: true,
        email_event_updates: true,
        email_reminders: true,
      });
    } catch {
      toast.error('Could not load settings');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: displayName.trim() || undefined,
          username: username.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save profile');
      toast.success('Profile updated!');
      setProfile(prev => ({ ...prev, ...data.profile }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function changeEmail(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success('Confirmation email sent! Check your inbox to confirm the change.');
      setNewEmail('');
    } catch (err) {
      toast.error(err.message || 'Could not update email');
    } finally {
      setEmailSaving(false);
    }
  }

  async function saveNotifPref(key, value) {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setPrefsSaving(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error('Could not save preference');
    } catch (err) {
      toast.error(err.message);
      setPrefs(prev => ({ ...prev, [key]: !value })); // revert
    } finally {
      setPrefsSaving(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== 'DELETE MY ACCOUNT') {
      toast.error('Please type the exact confirmation phrase');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/settings/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deletion failed');
      await supabase.auth.signOut();
      toast.success('Account deleted. Goodbye.');
      router.push('/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="container max-w-2xl py-10 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile, security, and preferences.</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>Your public identity on CampusPulse.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="full-name">Display Name</Label>
              <Input
                id="full-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">
                Username
                <span className="ml-2 text-xs text-muted-foreground">optional · 3–30 chars, letters/numbers/_.-</span>
              </Label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourhandle"
                  className="pl-9"
                  maxLength={30}
                  pattern="[a-zA-Z0-9_.\-]*"
                />
              </div>
              <p className="text-xs text-muted-foreground">Usernames are public and unique across CampusPulse.</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Role: <Badge variant="secondary" className="capitalize">{profile?.role}</Badge>
              </div>
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Security</CardTitle>
          </div>
          <CardDescription>Manage your email address and password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current email */}
          <div className="space-y-1.5">
            <Label>Current Email</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-sm font-mono">{profile?.auth_email || profile?.email}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Verified" />
            </div>
          </div>

          <Separator />

          {/* Change email */}
          <form onSubmit={changeEmail} className="space-y-3">
            <Label htmlFor="new-email">Change Email</Label>
            <p className="text-xs text-muted-foreground">
              A confirmation link will be sent to your new address. Your email won&apos;t change until you confirm.
            </p>
            <div className="flex gap-2">
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="new@email.com"
                className="flex-1"
              />
              <Button type="submit" variant="outline" disabled={emailSaving || !newEmail.trim()}>
                {emailSaving ? 'Sending…' : 'Change email'}
              </Button>
            </div>
          </form>

          <Separator />

          {/* Change password */}
          <div className="space-y-2">
            <Label>Password</Label>
            <p className="text-xs text-muted-foreground">Use a strong, unique password.</p>
            <Link href="/auth/update-password">
              <Button variant="outline" className="gap-2">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Change password
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Control which emails CampusPulse sends you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'email_rsvp_confirmation', label: 'RSVP confirmations', desc: 'When you RSVP to an event' },
            { key: 'email_volunteer_confirmation', label: 'Volunteer confirmations', desc: 'When you sign up to volunteer' },
            { key: 'email_event_updates', label: 'Event updates', desc: 'When events you joined are updated' },
            { key: 'email_reminders', label: 'Event reminders', desc: 'Reminders before events you joined' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                id={`notif-${key}`}
                checked={prefs?.[key] ?? true}
                onCheckedChange={val => saveNotifPref(key, val)}
                disabled={prefsSaving}
                aria-label={label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </div>
          <CardDescription>
            Permanently delete your account. Your institutional records (events, attendance logs) are preserved for campus records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="gap-2">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>This will permanently delete your account. You will lose access immediately.</p>
                  <p className="font-medium text-foreground">Your event RSVPs, volunteer signups, and attendance records are kept for campus records.</p>
                  <p>To confirm, type <strong>DELETE MY ACCOUNT</strong> below:</p>
                  <Input
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE MY ACCOUNT"
                    className="font-mono"
                  />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm('')}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={deleteAccount}
                  disabled={deleting || deleteConfirm !== 'DELETE MY ACCOUNT'}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete my account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
