import { NextResponse } from 'next/server';
import { initDatabase, getServerConfig } from '@/lib/turso';

// GET /api/owner/server-status — Get current server configuration
export async function GET() {
  try {
    await initDatabase();
  } catch {}

  try {
    const config = await getServerConfig();
    return NextResponse.json({
      success: true,
      ...config,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
