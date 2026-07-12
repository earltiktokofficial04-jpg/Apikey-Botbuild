import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, toggleMaintenance } from '@/lib/turso';

// POST /api/owner/toggle-server — Toggle maintenance mode
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { mode, title, message } = await request.json();

    if (!mode || !['on', 'off'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode mesti "on" atau "off".' },
        { status: 400 }
      );
    }

    const config = await toggleMaintenance(mode, title, message);

    return NextResponse.json({
      success: true,
      maintenance_mode: config.maintenance_mode,
      maintenance_title: config.maintenance_title,
      maintenance_message: config.maintenance_message,
      message: mode === 'on'
        ? 'Server kini dalam mode maintenance.'
        : 'Server kini kembali online.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
