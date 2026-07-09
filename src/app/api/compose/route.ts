import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { composeCommand, pruneImages, removeImage } from '@/lib/docker';
import { ComposeCommandSchema } from '@/lib/validations';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';

const limiter = rateLimit({ interval: 10000, uniqueTokenPerInterval: 500 });

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';
  try {
    await limiter.check(20, ip);
  } catch {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const validatedData = ComposeCommandSchema.parse(body);
    const { action, envId, workingDir, serviceName, imageName, configFiles, environmentFiles } = validatedData;
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    if (action === 'prune') {
      await pruneImages(env);
    } else if (action === 'rmi') {
      if (!imageName) return NextResponse.json({ error: 'Missing imageName' }, { status: 400 });
      await removeImage(env, imageName);
    } else {
      if (!workingDir) return NextResponse.json({ error: 'Missing workingDir' }, { status: 400 });
      // action can be 'pull', 'up -d', 'stop', 'rm -f', 'down --rmi all', 'up -d --remove-orphans'
      await composeCommand(env, action, workingDir, serviceName, configFiles, environmentFiles);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error in compose:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
