import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, claimAdReward } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// POST /api/user/claim-ad-reward — Claim credits after watching an ad.
// The reward amount is rolled here, server-side, and nothing about the
// odds is ever sent to either app — the client only learns the result.
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id, ad_id, watch_seconds } = await request.json();

    if (!device_id || ad_id === undefined || watch_seconds === undefined) {
      return NextResponse.json(
        { error: 'device_id, ad_id, dan watch_seconds diperlukan.' },
        { status: 400 }
      );
    }

    const result = await claimAdReward(device_id, parseInt(ad_id), Number(watch_seconds));

    return NextResponse.json(
      { success: result.success, message: result.message, reward: result.reward, credits: result.credits },
      { status: result.success ? 200 : 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
