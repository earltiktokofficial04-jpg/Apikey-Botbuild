import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, createAd } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/owner/create-ad — Create a new ad targeted at one user
// (by device_id or telegram_id). The ad is invisible to every other user.
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const body = await request.json();
    const { media_url, click_url, title, caption, target_device_id, target_telegram_id, limit_type, limit_value } = body;

    if (!media_url) {
      return NextResponse.json({ error: 'media_url diperlukan.' }, { status: 400 });
    }
    if (!target_device_id && !target_telegram_id) {
      return NextResponse.json(
        { error: 'target_device_id atau target_telegram_id diperlukan.' },
        { status: 400 }
      );
    }
    if (!['views', 'days'].includes(limit_type)) {
      return NextResponse.json({ error: 'limit_type mesti "views" atau "days".' }, { status: 400 });
    }
    const limitValue = parseInt(limit_value);
    if (!limitValue || limitValue <= 0) {
      return NextResponse.json({ error: 'limit_value mesti nombor positif.' }, { status: 400 });
    }

    const ad = await createAd({
      mediaUrl: media_url,
      clickUrl: click_url,
      title,
      caption,
      targetDeviceId: target_device_id,
      targetTelegramId: target_telegram_id,
      limitType: limit_type,
      limitValue,
    });

    return NextResponse.json({ success: true, ad });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
