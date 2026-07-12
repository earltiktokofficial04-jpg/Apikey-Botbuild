import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, claimCode } from '@/lib/turso';

// POST /api/user/claim-code — Claim a credit code
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id, code } = await request.json();

    if (!device_id || !code) {
      return NextResponse.json(
        { error: 'device_id dan code diperlukan.' },
        { status: 400 }
      );
    }

    const result = await claimCode(device_id, code.replace(/\s/g, '').toUpperCase());

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
