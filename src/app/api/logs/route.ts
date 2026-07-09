import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainerLogs } from '@/lib/docker';
import { EnvIdSchema } from '@/lib/validations';
import { z } from 'zod';

const ContainerIdSchema = z.string().regex(/^[a-fA-F0-9]+$/, 'Invalid container ID');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawEnvId = searchParams.get('envId');
  const rawContainerId = searchParams.get('containerId');

  if (!rawEnvId || !rawContainerId) {
    return NextResponse.json({ error: 'Missing envId or containerId' }, { status: 400 });
  }

  try {
    const envId = EnvIdSchema.parse(rawEnvId);
    const containerId = ContainerIdSchema.parse(rawContainerId);
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    const logs = await getContainerLogs(env, containerId);
    return NextResponse.json({ logs });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error fetching logs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
