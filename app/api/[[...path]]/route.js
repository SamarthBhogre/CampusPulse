import { NextResponse } from 'next/server';

/**
 * Catch-all fallback for unmatched /api/* routes.
 * Returns 404 instead of a misleading 200 OK, so callers know
 * the endpoint does not exist. BUG-005 fix.
 */
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export const PUT = GET;
export const OPTIONS = GET;
