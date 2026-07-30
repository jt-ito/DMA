import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainerStats } from '@/lib/docker';
import { EnvIdSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawEnvId = searchParams.get('envId');
  const containerId = searchParams.get('containerId');
  
  if (!rawEnvId || !containerId) {
    return NextResponse.json({ error: 'Missing envId or containerId' }, { status: 400 });
  }

  try {
    const envId = EnvIdSchema.parse(rawEnvId);
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    const stats = await getContainerStats(env, containerId);
    return NextResponse.json(stats);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error fetching container stats:', error?.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
