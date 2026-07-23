import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import rateLimit from '@/lib/rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 60 seconds
  uniqueTokenPerInterval: 500,
});

export async function POST(request: Request) {
  // Rate limiting based on IP
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
  try {
    await limiter.check(5, ip); // 5 login attempts per minute per IP
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: 'Missing username or password' }, { status: 400 });
  }

  const expectedUsername = process.env.ADMIN_USERNAME;
  if (expectedUsername && username !== expectedUsername) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    console.error('CRITICAL: ADMIN_PASSWORD_HASH is not set. Please set it using bcrypt.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const isValid = await bcrypt.compare(password, hash);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  // Create JWT session
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const session = await encrypt({ authenticated: true, role: 'admin', expires });

  // Save the session in a cookie
  const cookieStore = await cookies();
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expires,
    sameSite: 'lax',
    path: '/',
  });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0), // expire immediately
    sameSite: 'lax',
    path: '/',
  });
  return NextResponse.json({ success: true });
}
