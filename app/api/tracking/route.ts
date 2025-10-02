import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { trackingNumber, carrierId = 'kr.hanjin' } = await request.json();

    if (!trackingNumber) {
      return NextResponse.json(
        { error: 'trackingNumber is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.TRACKQL_API_KEY;
    if (!apiKey) {
      console.error('TRACKQL_API_KEY not configured');
      return NextResponse.json(
        { error: 'Tracking service not configured' },
        { status: 500 }
      );
    }

    const response = await fetch("https://apis.tracker.delivery/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `TRACKQL-API-KEY ${apiKey}`,
      },
      body: JSON.stringify({
        query: `query Track($carrierId: ID!, $trackingNumber: String!) {
          track(carrierId: $carrierId, trackingNumber: $trackingNumber) {
            lastEvent {
              time
              status { code name }
            }
          }
        }`,
        variables: {
          carrierId,
          trackingNumber
        },
      }),
    });

    const data = await response.json();

    // 에러 체크
    if (data.errors) {
      console.error('Tracking API error:', data.errors);
      return NextResponse.json(
        { error: data.errors[0]?.message || 'Tracking API error' },
        { status: 400 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Tracking API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tracking info' },
      { status: 500 }
    );
  }
}
