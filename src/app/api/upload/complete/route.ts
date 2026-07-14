import { NextRequest, NextResponse } from 'next/server';
import { initDatabase, deductCredits, getUser } from '@/lib/turso';
import { pushToGitHub, triggerWorkflow } from '@/lib/github';
import { detectProjectType } from '@/lib/detect';

// POST /api/upload/complete — Assemble chunks, auto-detect framework,
// push to GitHub, deduct credits
export async function POST(request: NextRequest) {
  try {
    await initDatabase();
  } catch {}

  try {
    const { upload_id } = await request.json();

    if (!upload_id) {
      return NextResponse.json({ error: 'upload_id diperlukan.' }, { status: 400 });
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

    const session = sessions.get(upload_id);
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found.' }, { status: 404 });
    }

    // Verify all chunks received
    if (session.receivedChunks < session.totalChunks) {
      return NextResponse.json(
        {
          error: `Chunks incomplete. Received ${session.receivedChunks}/${session.totalChunks}.`,
        },
        { status: 400 }
      );
    }

    // Assemble file from chunks
    const chunks: Buffer[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
      const chunk = session.chunks.get(i);
      if (!chunk) {
        return NextResponse.json(
          { error: `Missing chunk ${i}.` },
          { status: 400 }
        );
      }
      chunks.push(chunk);
    }

    const assembledBuffer = Buffer.concat(chunks);

    // Auto-detect the project framework, same logic as panel_bot's
    // detect_project() — the user never picks this manually.
    const detectedType = detectProjectType(assembledBuffer);

    if (!detectedType) {
      // Clean up session but do not charge credits for an unrecognized project.
      sessions.delete(upload_id);
      return NextResponse.json(
        {
          error:
            'Tidak dapat mengesan jenis projek ini. Pastikan ZIP mengandungi projek Flutter, Native Android, Smali, React Native, Cordova, Ionic, atau Capacitor yang sah.',
        },
        { status: 422 }
      );
    }

    // Clean up session
    sessions.delete(upload_id);

    // Deduct credits
    const UPLOAD_COST = 1;
    const deductionResult = await deductCredits(session.deviceId, UPLOAD_COST);

    if (!deductionResult.success) {
      return NextResponse.json(
        { error: deductionResult.message, credits: deductionResult.credits },
        { status: 402 }
      );
    }

    // Push to GitHub
    const pushResult = await pushToGitHub(assembledBuffer, session.filename);

    if (!pushResult.success) {
      // Refund credits if push fails
      const { addCredits } = await import('@/lib/turso');
      await addCredits(session.deviceId, UPLOAD_COST);

      return NextResponse.json(
        { error: pushResult.error || 'Gagal menghantar ke GitHub.' },
        { status: 500 }
      );
    }

    // Trigger GitHub Actions workflow
    await triggerWorkflow(detectedType, pushResult.uniqueName);

    // Get updated user info
    const user = await getUser(session.deviceId);

    return NextResponse.json({
      success: true,
      message: 'Projek berjaya dihantar dan build dimulakan!',
      credits: user.credits,
      unique_name: pushResult.uniqueName,
      detected_project_type: detectedType,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 }
    );
  }
}
