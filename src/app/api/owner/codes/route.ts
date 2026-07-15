import { NextResponse } from 'next/server';
import { initDatabase, getActiveCodes } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/owner/codes — List active/unused credit codes
export async function GET() {
  try {
    await initDatabase();
  } catch {}

  try {
    const codes = await getActiveCodes();

    return NextResponse.json({
      success: true,
      total: codes.length,
      codes: codes.map((c) => ({
        code: c.code,
        amount: c.amount,
        created_at: c.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
