import { NextResponse } from 'next/server';
import { requireOrganizer } from '@/lib/organizer-auth';
import { createTask } from '@/lib/services/tasks';

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
  const result = await createTask(auth, id, await request.json().catch(() => ({})));
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task }, { status: 201 });
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
