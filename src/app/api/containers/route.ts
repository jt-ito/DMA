import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainers, manageContainer } from '@/lib/docker';
import { EnvIdSchema, ManageContainerSchema } from '@/lib/validations';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawEnvId = searchParams.get('envId');
  
  if (!rawEnvId) {
    return NextResponse.json({ error: 'Missing envId' }, { status: 400 });
  }

  try {
    const envId = EnvIdSchema.parse(rawEnvId);
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    const containers = await getContainers(env);
    return NextResponse.json(containers);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error fetching containers:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = ManageContainerSchema.parse(body);
    const { envId, containerId, action } = validatedData;
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    await manageContainer(env, containerId, action);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error managing container:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
