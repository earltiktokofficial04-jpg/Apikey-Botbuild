import { NextResponse } from 'next/server';
import { checkMaintenance } from '@/lib/turso';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const maintenance = await checkMaintenance();
    return NextResponse.json({
      status: 'ok',
      ...maintenance,
    });
  } catch (error) {
    // Do NOT default to "online" here — if we can't even reach the
    // database to check maintenance status, the server state is
    // genuinely unknown, not confirmed-online. Report it as such so
    // the apps can distinguish "off" (a real toggle) from "unreachable".
    return NextResponse.json(
      {
        status: 'unavailable',
        is_maintenance: false,
        title: '',
        message: '',
      },
      { status: 503 }
    );
  }
}
