import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, deleteAds } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/owner/delete-ads — Bulk-delete ads by id
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids (array) diperlukan.' }, { status: 400 });
    }

    const result = await deleteAds(ids.map((id: unknown) => parseInt(String(id))));
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
