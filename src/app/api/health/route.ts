import { NextResponse } from 'next/server';
import { checkMaintenance } from '@/lib/turso';

export async function GET() {
  try {
    const maintenance = await checkMaintenance();
    return NextResponse.json({
      status: 'ok',
      ...maintenance,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'ok',
      is_maintenance: false,
      title: '',
      message: '',
    });
  }
}
