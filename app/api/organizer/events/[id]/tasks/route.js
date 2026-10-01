import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { taskInputSchema } from '@/lib/validation/tasks';

async function ownedEvent(auth, id) {
  const { data, error } = await auth.admin
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('created_by', auth.user.id)
    .maybeSingle();
  if (error) {
    console.error('Organizer event ownership lookup failed', error);
    return { error: 'Could not verify event ownership', status: 500 };
  }
  if (!data) return { error: 'Event not found', status: 404 };
  return { event: data };
}

export async function POST(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const owner = await ownedEvent(auth, id);
  if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status });
  const parsed = taskInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid task details' }, { status: 400 });
  const { data, error } = await auth.admin.from('tasks').insert({ event_id: id, ...parsed.data }).select('id').single();
  if (error) {
    console.error('Organizer task creation failed', error);
    return NextResponse.json({ error: 'Could not create task' }, { status: 500 });
  }
  return NextResponse.json({ task: data }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const auth = await requireOrganizer();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const taskId = new URL(request.url).searchParams.get('taskId');
  if (!taskId) return NextResponse.json({ error: 'Task is required' }, { status: 400 });
  const owner = await ownedEvent(auth, id);
  if (owner.error) return NextResponse.json({ error: owner.error }, { status: owner.status });
  const { error } = await auth.admin.from('tasks').delete().eq('id', taskId).eq('event_id', id);
  if (error) {
    console.error('Organizer task deletion failed', error);
    return NextResponse.json({ error: 'Could not delete task' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
