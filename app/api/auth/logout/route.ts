import { NextResponse } from 'next/server';
import { deleteToken } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const deleted = await deleteToken();

    if (deleted) {
      return NextResponse.json({
        success: true,
        message: '인증 정보가 삭제되었습니다.'
      });
    }

    return NextResponse.json({
      success: false,
      message: '인증 정보 삭제에 실패했습니다.'
    }, { status: 500 });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({
      success: false,
      message: '인증 정보 삭제 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
