import { NextRequest, NextResponse } from 'next/server';

// POST /api/upload/chunk — Receive a single chunk of the uploaded file
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploadId = formData.get('upload_id') as string;
    const chunkIndex = parseInt(formData.get('chunk_index') as string);
    const chunkFile = formData.get('chunk') as File;

    if (!uploadId || isNaN(chunkIndex) || !chunkFile) {
      return NextResponse.json(
        { error: 'upload_id, chunk_index, dan chunk diperlukan.' },
        { status: 400 }
      );
    }

    const sessions = (globalThis as Record<string, unknown>)._uploadSessions as Map<string, {
      deviceId: string;
      filename: string;
      totalSize: number;
      totalChunks: number;
      receivedChunks: number;
      chunks: Map<number, Buffer>;
      createdAt: number;
    }>;

    if (!sessions) {
      return NextResponse.json({ error: 'Upload session not found.' }, { status: 404 });
    }

    const session = sessions.get(uploadId);
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found.' }, { status: 404 });
    }

    // Convert File to Buffer
    const bytes = await chunkFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Store chunk
    session.chunks.set(chunkIndex, buffer);
    session.receivedChunks++;

    return NextResponse.json({
      success: true,
      received: session.receivedChunks,
      total: session.totalChunks,
      progress: Math.round((session.receivedChunks / session.totalChunks) * 100),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
