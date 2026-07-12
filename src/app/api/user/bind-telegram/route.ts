import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, bindTelegram } from '@/lib/turso';
import { notifyTelegram, getBotUsername } from '@/lib/github';

// POST /api/user/bind-telegram — Bind Telegram ID to device
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id, telegram_id } = await request.json();

    if (!device_id || !telegram_id) {
      return NextResponse.json(
        { error: 'device_id dan telegram_id diperlukan.' },
        { status: 400 }
      );
    }

    const result = await bindTelegram(device_id, telegram_id);

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    // Try to notify user via Telegram bot
    const notifResult = await notifyTelegram(
      telegram_id,
      '<b>Pengikatan Berjaya</b>\n\n' +
      'Device anda telah berjaya diikat ke akaun Telegram ini.\n' +
      'Anda kini boleh menggunakan perkhidmatan melalui aplikasi.'
    );

    const botUsername = (await getBotUsername()) || 'EarlBuildBot';

    return NextResponse.json({
      success: true,
      message: 'Telegram berjaya diikat!',
      telegram_notified: notifResult.success,
      guidance: notifResult.success
        ? null
        : `Sila hantar /start di http://t.me/${botUsername} untuk mengaktifkan notifikasi.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
