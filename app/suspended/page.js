import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShieldOff } from 'lucide-react';

export const metadata = { title: 'Account Suspended — CampusPulse' };

export default function SuspendedPage() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <ShieldOff className="mb-4 h-16 w-16 text-destructive" aria-hidden="true" />
      <h1 className="text-3xl font-bold mb-2">Account Suspended</h1>
      <p className="max-w-md text-muted-foreground mb-6">
        Your account has been suspended by a campus administrator. If you believe this is
        a mistake, please contact your campus IT help desk or student affairs office.
      </p>
      <div className="flex gap-3">
        <Link href="/auth/sign-in">
          <Button variant="outline">Sign in to a different account</Button>
        </Link>
      </div>
    </div>
  );
}
