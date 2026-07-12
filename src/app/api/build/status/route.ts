import { NextResponse } from 'next/server';
import { getBuildQueue } from '@/lib/github';

// GET /api/build/status — Get current build queue status
export async function GET() {
  try {
    const queue = await getBuildQueue();
    return NextResponse.json({
      success: true,
      in_progress: queue,
      estimated_minutes: queue * 5,
      message: queue > 0
        ? `${queue} build dalam queue. Anggaran menunggu: ${queue * 5} minit.`
        : 'Tiada build dalam queue.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
