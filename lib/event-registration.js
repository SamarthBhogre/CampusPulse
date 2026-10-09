export const REGISTRATION_MODES = ['auto', 'open', 'closed'];

/**
 * Mirrors the enforce_event_rsvp_capacity trigger (migration 020) so the UI
 * shows the same state the database will enforce.
 */
export function getRegistrationState(event, rsvpCount) {
  const mode = event?.registration_mode || 'auto';
  const max = event?.max_attendees ?? null;
  const count = Number(rsvpCount || 0);
  const isFull = max != null && count >= max;
  const isOpen = mode === 'open' || (mode === 'auto' && !isFull);
  const spotsLeft = max == null ? null : Math.max(0, max - count);
  return { mode, max, count, isFull, isOpen, spotsLeft };
}
