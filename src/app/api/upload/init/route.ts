import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, getUser, checkMaintenance } from '@/lib/turso';

// POST /api/upload/init — Initialize a chunked upload session
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { device_id, filename, total_size, total_chunks } = await request.json();

    if (!device_id || !filename || !total_size || !total_chunks) {
      return NextResponse.json(
        { error: 'device_id, filename, total_size, dan total_chunks diperlukan.' },
        { status: 400 }
      );
    }

    // Check maintenance mode
    const maintenance = await checkMaintenance();
    if (maintenance.is_maintenance) {
      return NextResponse.json({
        error: 'Server sedang maintenance.',
        maintenance_title: maintenance.title,
        maintenance_message: maintenance.message,
      }, { status: 503 });
    }

    // Check user exists and has credits
    const user = await getUser(device_id);
    const UPLOAD_COST = 1;

    if (user.credits < UPLOAD_COST) {
      return NextResponse.json(
        { error: 'Kredit tidak mencukupi. Sila tambah kredit anda.', credits: user.credits },
        { status: 402 }
      );
    }

    // Generate unique upload ID
    const uploadId = `${device_id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Store upload session in memory (in production, use Redis or similar)
    const sessions = (globalThis as Record<string, unknown>)._uploadSessions as Map<string, {
      deviceId: string;
      filename: string;
      totalSize: number;
      totalChunks: number;
      receivedChunks: number;
      chunks: Map<number, Buffer>;
      createdAt: number;
    }> || new Map();

    // Clean up old sessions (older than 30 minutes)
    const now = Date.now();
    const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
    for (const [key, session] of sessions) {
      if (now - session.createdAt > SESSION_TTL) {
        sessions.delete(key);
      }
    }

    sessions.set(uploadId, {
      deviceId: device_id,
      filename,
      totalSize: total_size,
      totalChunks: total_chunks,
      receivedChunks: 0,
      chunks: new Map(),
      createdAt: Date.now(),
    });

    (globalThis as Record<string, unknown>)._uploadSessions = sessions;

    return NextResponse.json({
      success: true,
      upload_id: uploadId,
      message: 'Upload session started.',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
