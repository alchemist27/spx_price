import { NextRequest, NextResponse } from 'next/server';
import { cafe24API } from '@/lib/cafe24-api';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  if (error) {
    // OAuth 에러가 발생한 경우
    return NextResponse.redirect(
      new URL(`/?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    // 인증 코드가 없는 경우
    return NextResponse.redirect(
      new URL('/?error=no_code', request.url)
    );
  }

  try {
    console.log('🚀 OAuth 콜백 처리 시작:', { 
      code: code.substring(0, 10) + '...',
      state,
      url: request.url 
    });
    
    // 인증 코드를 토큰으로 교환
    const token = await cafe24API.exchangeCodeForToken(code);
    
    if (token) {
      console.log('✅ 토큰 교환 성공, 메인 페이지로 리다이렉트');
      // 성공적으로 토큰을 받은 경우, 메인 페이지로 리다이렉트
      return NextResponse.redirect(
        new URL('/?auth=success', request.url)
      );
    } else {
      console.error('❌ 토큰 교환 실패, 에러 페이지로 리다이렉트');
      // 토큰 교환 실패
      return NextResponse.redirect(
        new URL('/?error=token_exchange_failed', request.url)
      );
    }
  } catch (error) {
    console.error('❌ OAuth 콜백 에러:', error);
    return NextResponse.redirect(
      new URL('/?error=auth_failed', request.url)
    );
  }
} 