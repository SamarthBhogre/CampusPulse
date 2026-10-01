import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Lightweight health check for load balancers and monitoring.
 * Returns current timestamp and status.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'campus-pulse',
  });
}
