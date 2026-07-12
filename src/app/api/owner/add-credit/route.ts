import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, addCredits } from '@/lib/turso';

// POST /api/owner/add-credit — Add credit to user by device_id or telegram_id
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { target, amount, method } = await request.json();

    if (!target || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'target (device_id / telegram_id) dan amount (>0) diperlukan.' },
        { status: 400 }
      );
    }

    const result = await addCredits(target, parseInt(amount));

    return NextResponse.json(result, {
      status: result.success ? 200 : 404,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
