import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, deleteUsers } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/owner/bulk-delete-users — Bulk-delete users by device_id
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_ids } = await request.json();

    if (!Array.isArray(device_ids) || device_ids.length === 0) {
      return NextResponse.json({ error: 'device_ids (array) diperlukan.' }, { status: 400 });
    }

    const result = await deleteUsers(device_ids);
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
