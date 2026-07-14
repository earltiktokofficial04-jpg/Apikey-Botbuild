import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, requestBindVerification } from '@/lib/turso';
import { notifyTelegram, getBotUsername } from '@/lib/github';

// POST /api/user/bind-telegram — Step 1: request a verification code.
// The code is sent to the user's Telegram (wrapped in <blockquote> so it's
// unambiguous what to copy), and must be submitted to
// /api/user/bind-telegram/confirm before the bind actually takes effect.
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

    const result = await requestBindVerification(device_id, telegram_id);

    if (!result.success || !result.code) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    // Send the verification code via Telegram, wrapped in <blockquote> so
    // it's clearly a single value the user should copy into the app.
    const notifResult = await notifyTelegram(
      telegram_id,
      '<b>Pengesahan Pengikatan Device</b>\n\n' +
      'Salin kod di bawah dan masukkan dalam aplikasi untuk sahkan pengikatan:\n\n' +
      `<blockquote>${result.code}</blockquote>\n\n` +
      'Jangan kongsi kod ini dengan sesiapa.'
    );

    const botUsername = (await getBotUsername()) || 'EarlBuildBot';

    return NextResponse.json({
      success: true,
      message: notifResult.success
        ? 'Kod pengesahan telah dihantar ke Telegram anda.'
        : 'Kod dijana tetapi gagal dihantar ke Telegram.',
      telegram_notified: notifResult.success,
      guidance: notifResult.success
        ? null
        : `Sila hantar /start di http://t.me/${botUsername} dahulu, kemudian cuba lagi.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
