import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, deleteCodes } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/owner/bulk-delete-codes — Bulk-delete credit codes
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { codes } = await request.json();

    if (!Array.isArray(codes) || codes.length === 0) {
      return NextResponse.json({ error: 'codes (array) diperlukan.' }, { status: 400 });
    }

    const result = await deleteCodes(codes);
    return NextResponse.json({ success: true, deleted: result.deleted });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
