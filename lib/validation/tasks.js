import { z } from 'zod';

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200),
  description: z.string().trim().max(2000).nullable().optional().default(null),
  volunteers_needed: z.coerce.number().int().min(1).max(1000),
});
