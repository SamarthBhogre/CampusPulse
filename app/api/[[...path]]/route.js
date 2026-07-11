import { NextResponse } from 'next/server';

// Health check endpoint - Campus Pulse uses Supabase directly, no custom REST backend.
// This handler exists only so /api/* routes don't 404 during deployment health checks.

export async function GET() {
  return NextResponse.json({ status: 'ok', app: 'Campus Pulse' });
}

export async function POST() {
  return NextResponse.json({ status: 'ok', app: 'Campus Pulse' });
}

export const OPTIONS = GET;
