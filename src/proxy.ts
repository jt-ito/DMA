import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

const protectedRoutes = ['/'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Exclude login and auth APIs from protection
  if (pathname === '/login' || pathname.startsWith('/api/auth') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Check if route is protected (UI or generic API)
  const isProtectedRoute = protectedRoutes.includes(pathname) || pathname.startsWith('/api/');

  if (isProtectedRoute) {
    const session = request.cookies.get('session')?.value;
    
    if (!session) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    try {
      await decrypt(session);
      return NextResponse.next();
    } catch (e) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
