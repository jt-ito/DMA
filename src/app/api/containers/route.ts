import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainers, manageContainer } from '@/lib/docker';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const envId = searchParams.get('envId');
  if (!envId) {
    return NextResponse.json({ error: 'Missing envId' }, { status: 400 });
  }
  
  const env = getEnvironment(envId);
  if (!env) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  
  try {
    const containers = await getContainers(env);
    return NextResponse.json(containers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const { envId, containerId, action } = body;
  
  if (!envId || !containerId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  
  const env = getEnvironment(envId);
  if (!env) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  
  try {
    await manageContainer(env, containerId, action);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
