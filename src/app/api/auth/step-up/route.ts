import { NextResponse } from 'next/server';
import { encrypt } from '@/lib/auth';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import rateLimit from '@/lib/rate-limit';
import crypto from 'crypto';

const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
  try {
    await limiter.check(5, ip); // Protect step-up from brute force
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { password } = await request.json();

  if (!password) {
    return NextResponse.json({ error: 'Missing password' }, { status: 400 });
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const isValid = await bcrypt.compare(password, hash);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Generate an independent CSRF token
  const csrfToken = crypto.randomBytes(32).toString('hex');

  // Create short-lived step-up session (5 minutes)
  const expires = new Date(Date.now() + 5 * 60 * 1000);
  const debugToken = await encrypt({ stepUp: true, csrfToken, expires });

  const cookieStore = await cookies();
  cookieStore.set('debug_token', debugToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expires,
    sameSite: 'strict', // Stricter than main session
    path: '/api/debug', // Restrict to debug route
  });

  return NextResponse.json({ success: true, csrfToken });
}
