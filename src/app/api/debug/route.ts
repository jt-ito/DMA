import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';
import { DebugCommandSchema } from '@/lib/validations';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { cookies } from 'next/headers';
import { decrypt, getSession } from '@/lib/auth';

const limiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 100 });

export async function POST(request: Request) {
  // 1. Feature Flag (Off by default)
  if (process.env.ENABLE_DEBUG_ENDPOINT !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';

  // 6. Independent Rate Limiting (Stricter: 2 per minute)
  try {
    await limiter.check(2, ip);
  } catch {
    return NextResponse.json({ error: 'Too many requests to debug endpoint' }, { status: 429 });
  }

  // 3 & 4. Step-up Re-authentication & CSRF Verification
  const cookieStore = await cookies();
  const debugToken = cookieStore.get('debug_token')?.value;
  const providedCsrfToken = request.headers.get('x-csrf-token');

  if (!debugToken || !providedCsrfToken) {
    return NextResponse.json({ error: 'Step-up authentication required' }, { status: 403 });
  }

  let stepUpSession;
  try {
    stepUpSession = await decrypt(debugToken);
  } catch {
    return NextResponse.json({ error: 'Invalid step-up token' }, { status: 403 });
  }

  if (!stepUpSession.stepUp || stepUpSession.csrfToken !== providedCsrfToken) {
    return NextResponse.json({ error: 'CSRF token mismatch or invalid step-up' }, { status: 403 });
  }

  // 5. Main Session Check (Defense in Depth alongside proxy.ts)
  const mainSession = await getSession();
  if (!mainSession) {
    return NextResponse.json({ error: 'Main session authentication required' }, { status: 401 });
  }
  const user = mainSession.role || 'unknown-role';

  let validatedData;
  try {
    const body = await request.json();
    validatedData = DebugCommandSchema.parse(body);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }

  const { envId, command, cwd } = validatedData;
  
  const env = getEnvironment(envId);
  if (!env) return NextResponse.json({ error: 'Env not found' }, { status: 404 });
  
  // 2. Audit Logging (Pre-execution)
  logAudit('debug_command_started', user, ip, { envId, command, cwd });

  try {
    const result = await executeCommand(env, command, undefined, cwd);
    // 2. Audit Logging (Post-execution)
    logAudit('debug_command_completed', user, ip, { 
      envId, 
      command, 
      cwd, 
      exitCode: 0, 
      output: result.stdout.substring(0, 500) // Truncate output
    });
    return NextResponse.json({ result });
  } catch (error: any) {
    logAudit('debug_command_failed', user, ip, { 
      envId, 
      command, 
      cwd, 
      error: error.message 
    });
    console.error('Error in debug route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
