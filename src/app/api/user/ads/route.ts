import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getUser, getActiveAdForUser } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/user/ads?device_id= — Returns the ad currently available to
// this device (targeted specifically at it or its bound Telegram ID),
// or null if there's nothing to show.
export async function GET(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const deviceId = request.nextUrl.searchParams.get('device_id');
    if (!deviceId) {
      return NextResponse.json({ error: 'device_id diperlukan.' }, { status: 400 });
    }

    const user = await getUser(deviceId);
    const ad = await getActiveAdForUser(deviceId, user.telegram_id);

    return NextResponse.json({ success: true, ad });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
