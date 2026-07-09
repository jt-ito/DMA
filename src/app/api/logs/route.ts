import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getContainerLogs } from '@/lib/docker';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const envId = searchParams.get('envId');
  const containerId = searchParams.get('containerId');

  if (!envId || !containerId) {
    return NextResponse.json({ error: 'Missing envId or containerId' }, { status: 400 });
  }

  const env = getEnvironment(envId);
  if (!env) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }

  try {
    const logs = await getContainerLogs(env, containerId);
    return NextResponse.json({ logs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
