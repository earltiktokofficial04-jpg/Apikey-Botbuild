import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getUser, getActiveAdForUser, getDailyAdStatus } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/user/ads?device_id= — Returns the ad currently available to
// this device (targeted specifically at it, its bound Telegram ID, or a
// broadcast ad with no target), plus how many rewarded views are left
// today. `ad` is null if there's nothing to show right now.
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
    const daily = await getDailyAdStatus(deviceId);
    const ad = daily.remaining > 0 ? await getActiveAdForUser(deviceId, user.telegram_id) : null;

    return NextResponse.json({
      success: true,
      ad,
      daily_remaining: daily.remaining,
      daily_limit: daily.limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
