import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getAllUsers, getUserCount } from '@/lib/turso';

// GET /api/owner/users — List all users
export async function GET() {
  try {
    await initDatabase();
  } catch {}

  try {
    const [users, count] = await Promise.all([getAllUsers(), getUserCount()]);

    return NextResponse.json({
      success: true,
      total: count,
      users: users.map((u) => ({
        device_id: u.device_id,
        telegram_id: u.telegram_id,
        credits: u.credits,
        total_uploads: u.total_uploads,
        created_at: u.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
