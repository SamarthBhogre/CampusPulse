import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this section. Please try again.',
  onRetry,
  className,
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center ${className || ''}`}
      role="alert"
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <h2 className="font-semibold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
