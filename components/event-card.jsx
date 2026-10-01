import Link from 'next/link';
import { Calendar, Clock3, MapPin, Users, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function EventCard({ event, capacity, compact = false }) {
  const needed = Number(capacity?.total_needed || 0);
  const filled = Number(capacity?.total_filled || 0);
  const openSlots = Math.max(0, needed - filled);

  return (
    <Link
      href={`/events/${event.id}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:border-border">
        {/* Cover */}
        <div className={cn('overflow-hidden bg-muted shrink-0', compact ? 'aspect-[16/8]' : 'aspect-[16/9]')}>
          {event.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_image}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/8 via-muted to-muted text-primary/30">
              <Calendar className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            {event.clubs?.name ? (
              <Badge variant="secondary" className="max-w-[75%] truncate text-[11px]">
                {event.clubs.name}
              </Badge>
            ) : <span />}
            {event.visibility === 'club_only' && (
              <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
                <Lock className="h-2.5 w-2.5" /> Members
              </Badge>
            )}
          </div>

          <h2 className="line-clamp-2 font-semibold leading-snug tracking-tight">
            {event.title}
          </h2>

          {!compact && event.description && (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
              {event.description}
            </p>
          )}

          <div className="mt-auto space-y-1.5 pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" />
              <span>{format(new Date(event.starts_at), 'EEE, MMM d, yyyy')}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                {format(new Date(event.starts_at), 'h:mm a')}
              </span>
              {event.location && (
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </span>
              )}
            </div>
            {needed > 0 && (
              <div className={cn(
                'flex items-center gap-1.5 border-t pt-2.5 mt-1 font-medium',
                openSlots > 0 ? 'text-primary' : 'text-muted-foreground'
              )}>
                <Users className="h-3.5 w-3.5" />
                {openSlots > 0
                  ? `${openSlots} volunteer slot${openSlots === 1 ? '' : 's'} open`
                  : 'Volunteer tasks full'}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
