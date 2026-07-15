import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, deleteUser } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/owner/delete-user — Remove a user (by device_id)
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id } = await request.json();

    if (!device_id) {
      return NextResponse.json({ error: 'device_id diperlukan.' }, { status: 400 });
    }

    const result = await deleteUser(device_id);
    return NextResponse.json(
      { success: result.success, message: result.message },
      { status: result.success ? 200 : 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
