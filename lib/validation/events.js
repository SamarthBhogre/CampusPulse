import { z } from 'zod';

const nullableText = (max) => z.union([z.string().trim().max(max), z.null()]).optional().default(null);

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: nullableText(5000),
  location: nullableText(300),
  starts_at: z.coerce.date({ required_error: 'Start time is required' }),
  ends_at: z.coerce.date().nullable().optional().default(null),
  cover_image: nullableText(2048),
  club_id: z.union([z.string().uuid(), z.null()]).optional().default(null),
  visibility: z.enum(['public', 'club_only']).default('public'),
  // Omitted = leave unchanged on update; null = unlimited.
  max_attendees: z.union([
    z.coerce.number({ invalid_type_error: 'Attendee limit must be a number' })
      .int('Attendee limit must be a whole number')
      .min(1, 'Attendee limit must be at least 1')
      .max(100000, 'Attendee limit is too large'),
    z.null(),
  ]).optional(),
}).superRefine((value, context) => {
  if (value.ends_at && value.ends_at <= value.starts_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ends_at'], message: 'End time must be after start time' });
  }
});

export const registrationModeSchema = z.object({
  registration_mode: z.enum(['auto', 'open', 'closed'], {
    errorMap: () => ({ message: 'Registration mode must be auto, open, or closed' }),
  }),
});
