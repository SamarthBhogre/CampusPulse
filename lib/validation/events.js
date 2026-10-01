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
}).superRefine((value, context) => {
  if (value.ends_at && value.ends_at <= value.starts_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ends_at'], message: 'End time must be after start time' });
  }
});
