import { NextResponse } from 'next/server';
import { getToken } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await getToken();

    if (token) {
      return NextResponse.json({
        authenticated: true,
        expiresAt: token.expires_at
      });
    }

    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error('Auth status check error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
