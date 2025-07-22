import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    // 환경변수에서 관리자 계정 정보 가져오기
    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) {
      console.error('❌ 관리자 계정 환경변수가 설정되지 않았습니다.');
      return NextResponse.json(
        { message: '서버 설정 오류입니다.' },
        { status: 500 }
      );
    }

    // 아이디와 비밀번호 검증
    if (username === adminUsername && password === adminPassword) {
      console.log('✅ 관리자 로그인 성공:', username);
      return NextResponse.json(
        { 
          success: true, 
          message: '로그인 성공',
          user: { username }
        },
        { status: 200 }
      );
    } else {
      console.log('❌ 관리자 로그인 실패:', { username, passwordLength: password?.length || 0 });
      return NextResponse.json(
        { message: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('❌ 로그인 API 오류:', error);
    return NextResponse.json(
      { message: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 