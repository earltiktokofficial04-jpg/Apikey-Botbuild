import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, unbindTelegram } from '@/lib/turso';

// POST /api/user/unbind-telegram — Release the Telegram ID bound to a
// device. Required before that device can bind a different Telegram ID.
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id } = await request.json();

    if (!device_id) {
      return NextResponse.json({ error: 'device_id diperlukan.' }, { status: 400 });
    }

    const result = await unbindTelegram(device_id);
    return NextResponse.json({ success: result.success, message: result.message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
