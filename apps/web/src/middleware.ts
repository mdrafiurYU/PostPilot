import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard(.*)',
    '/assets(.*)',
    '/calendar(.*)',
    '/analytics(.*)',
    '/channels(.*)',
    '/notifications(.*)',
  ],
}
