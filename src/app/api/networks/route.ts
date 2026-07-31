import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getNetworks, createNetwork } from '@/lib/docker';
import { EnvIdSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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
    
    const networks = await getNetworks(env);
    return NextResponse.json({ networks });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error fetching networks:', error?.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { envId, name } = body;
    
    if (!envId || !name) {
      return NextResponse.json({ error: 'Missing envId or name' }, { status: 400 });
    }

    const parsedEnvId = EnvIdSchema.parse(envId);
    const env = getEnvironment(parsedEnvId);
    
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    await createNetwork(env, name);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error creating network:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawEnvId = searchParams.get('envId');
  const nameOrId = searchParams.get('nameOrId');
  
  if (!rawEnvId || !nameOrId) {
    return NextResponse.json({ error: 'Missing envId or nameOrId' }, { status: 400 });
  }

  try {
    const envId = EnvIdSchema.parse(rawEnvId);
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    const { removeNetwork } = await import('@/lib/docker');
    await removeNetwork(env, nameOrId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error deleting network:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
