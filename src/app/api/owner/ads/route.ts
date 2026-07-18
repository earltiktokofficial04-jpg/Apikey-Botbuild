import { NextResponse } from 'next/server';
import { initDatabase, getAds } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/owner/ads — List all ads (for the Manage Ads screen)
export async function GET() {
  try {
    await initDatabase();
  } catch {}

  try {
    const ads = await getAds();
    return NextResponse.json({ success: true, total: ads.length, ads });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
