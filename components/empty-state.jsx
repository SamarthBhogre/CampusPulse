import { cn } from '@/lib/utils';

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border/50 bg-background text-primary shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
