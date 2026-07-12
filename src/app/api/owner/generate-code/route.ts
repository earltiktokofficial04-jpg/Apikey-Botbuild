import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, generateCreditCodes } from '@/lib/turso';

// POST /api/owner/generate-code — Generate credit code(s)
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { amount, count } = await request.json();

    if (!amount || amount <= 0 || !count || count <= 0) {
      return NextResponse.json(
        { error: 'amount (>0) dan count (>0) diperlukan.' },
        { status: 400 }
      );
    }

    const maxCount = Math.min(parseInt(count), 50); // Max 50 codes per generation
    const codes = await generateCreditCodes(parseInt(amount), maxCount);

    return NextResponse.json({
      success: true,
      codes: codes.map((c) => ({
        code: c.code,
        amount: c.amount,
        created_at: c.created_at,
      })),
      message: `${codes.length} kod berjaya dijana.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
