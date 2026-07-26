import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainers, manageContainer } from '@/lib/docker';
import { EnvIdSchema, ManageContainerSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

declare global {
  var _dockerConnectionState: boolean | undefined;
}

function setDockerConnected(connected: boolean) {
  const prevState = global._dockerConnectionState ?? true;
  if (connected && !prevState) {
    console.log('SUCCESS: Docker Desktop connected successfully.');
  }
  global._dockerConnectionState = connected;
}

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
    setDockerConnected(true);
    return NextResponse.json(containers);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    if (error?.message?.includes('dockerDesktopLinuxEngine') || error?.message?.includes('error during connect')) {
      const prevState = global._dockerConnectionState ?? true;
      if (prevState) {
        console.error('WARNING: Docker is not running. Please start Docker Desktop or the Docker daemon to view containers.');
      }
      global._dockerConnectionState = false;
    } else {
      console.error('Error fetching containers:', error?.message || error);
    }
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
    setDockerConnected(true);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    if (error?.message?.includes('dockerDesktopLinuxEngine') || error?.message?.includes('error during connect')) {
      const prevState = global._dockerConnectionState ?? true;
      if (prevState) {
        console.error('WARNING: Docker is not running. Please start Docker Desktop or the Docker daemon to manage containers.');
      }
      global._dockerConnectionState = false;
    } else {
      console.error('Error managing container:', error?.message || error);
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
