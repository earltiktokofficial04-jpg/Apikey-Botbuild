import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getUser } from '@/lib/turso';

// GET /api/user/me?device_id=xxx — Get user info & credits
export async function GET(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  const deviceId = request.nextUrl.searchParams.get('device_id');

  if (!deviceId) {
    return NextResponse.json({ error: 'device_id diperlukan.' }, { status: 400 });
  }

  try {
    const user = await getUser(deviceId);
    return NextResponse.json({
      success: true,
      device_id: user.device_id,
      telegram_id: user.telegram_id,
      credits: user.credits,
      total_uploads: user.total_uploads,
      created_at: user.created_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
