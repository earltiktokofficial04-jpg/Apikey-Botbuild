import { NextRequest, NextResponse } from 'next/server';
import { initDatabase } from '@/lib/turso';

// POST /api/user/register — Register/get user by device ID
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {
    // DB might already be initialized
  }

  try {
    const { device_id } = await request.json();

    if (!device_id || typeof device_id !== 'string' || device_id.length < 4) {
      return NextResponse.json(
        { error: 'Device ID tidak sah.' },
        { status: 400 }
      );
    }

    const { getUser } = await import('@/lib/turso');
    const user = await getUser(device_id);

    const isNew = user.total_uploads === 0 && user.credits === 5 && !user.telegram_id;

    return NextResponse.json({
      success: true,
      user: {
        device_id: user.device_id,
        telegram_id: user.telegram_id,
        credits: user.credits,
        total_uploads: user.total_uploads,
        created_at: user.created_at,
      },
      is_new: isNew,
      message: isNew ? 'Akaun baru! 5 kredit percuma diberikan.' : 'Akaun sedia ada.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
