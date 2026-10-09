import { taskInputSchema, taskUpdateSchema } from '@/lib/validation/tasks';
import { getManagedEvent } from '@/lib/services/events';
import { logger } from '@/lib/logger';

export async function createTask(ctx, eventId, input) {
  const owner = await getManagedEvent(ctx, eventId);
  if (owner.error) return owner.status === 404 ? { error: 'Event not found', status: 404 } : owner;

  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Invalid task details', status: 400 };

  const { data, error } = await ctx.admin
    .from('tasks')
    .insert({ event_id: eventId, ...parsed.data })
    .select('id, event_id, title, description, volunteers_needed')
    .single();
  if (error) {
    logger.error('Task creation failed', error, { eventId, userId: ctx.user.id });
    return { error: 'Could not create task', status: 500 };
  }
  return { task: data };
}

/** Partially updates a task on an event the caller owns. Capacity cannot drop below current signups. */
export async function updateTask(ctx, taskId, input) {
  const parsed = taskUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Invalid task details', status: 400 };
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
  if (Object.keys(changes).length === 0) return { error: 'Nothing to update', status: 400 };

  const { data: task, error: taskError } = await ctx.admin
    .from('tasks')
    .select('id, event_id, events!inner(created_by)')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) {
    logger.error('Task ownership lookup failed', taskError, { taskId, userId: ctx.user.id });
    return { error: 'Could not verify task ownership', status: 500 };
  }
  if (!task || task.events?.created_by !== ctx.user.id) return { error: 'Task not found or you do not own it', status: 404 };

  if (changes.volunteers_needed !== undefined) {
    const { count, error: countError } = await ctx.admin
      .from('volunteer_signups')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId);
    if (countError) {
      logger.error('Task signup count failed', countError, { taskId });
      return { error: 'Could not update task', status: 500 };
    }
    if ((count || 0) > changes.volunteers_needed) {
      return { error: `This task already has ${count} volunteers; capacity cannot be lower than that`, status: 409 };
    }
  }

  const { data, error } = await ctx.admin
    .from('tasks')
    .update(changes)
    .eq('id', taskId)
    .select('id, event_id, title, description, volunteers_needed')
    .single();
  if (error) {
    logger.error('Task update failed', error, { taskId, userId: ctx.user.id });
    return { error: 'Could not update task', status: 500 };
  }
  return { task: data };
}
