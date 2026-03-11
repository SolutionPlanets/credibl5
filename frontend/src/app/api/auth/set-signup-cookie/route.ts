import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { plan, billing, maxLocations } = body

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan is required' },
        { status: 400 }
      )
    }

    const signupData = {
      isSignup: true,
      plan,
      billing: billing || 'monthly',
      maxLocations: maxLocations || 1,
      timestamp: Date.now()
    }

    const response = NextResponse.json({ success: true })

    response.cookies.set('pending_signup', JSON.stringify(signupData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Error setting signup cookie:', error)
    return NextResponse.json(
      { error: 'Failed to set signup cookie' },
      { status: 500 }
    )
  }
}
