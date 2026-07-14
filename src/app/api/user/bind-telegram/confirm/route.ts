import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, confirmBindVerification } from '@/lib/turso';

// POST /api/user/bind-telegram/confirm — Step 2: submit the verification
// code that was sent via Telegram to actually complete the bind.
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id, code } = await request.json();

    if (!device_id || !code) {
      return NextResponse.json(
        { error: 'device_id dan code diperlukan.' },
        { status: 400 }
      );
    }

    const result = await confirmBindVerification(device_id, code);

    return NextResponse.json(
      { success: result.success, message: result.message },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
