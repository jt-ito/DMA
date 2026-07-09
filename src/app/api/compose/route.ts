import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { composeCommand, pruneImages, removeImage } from '@/lib/docker';

export async function POST(request: Request) {
  const body = await request.json();
  const { action, envId, workingDir, serviceName, imageName, configFiles, environmentFiles } = body;
  
  if (!envId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  
  const env = getEnvironment(envId);
  if (!env) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }
  
  try {
    if (action === 'prune') {
      await pruneImages(env);
    } else if (action === 'rmi') {
      if (!imageName) return NextResponse.json({ error: 'Missing imageName' }, { status: 400 });
      await removeImage(env, imageName);
    } else {
      if (!workingDir) return NextResponse.json({ error: 'Missing workingDir' }, { status: 400 });
      // action can be 'pull', 'up -d', 'stop', 'rm -f'
      await composeCommand(env, action, workingDir, serviceName, configFiles, environmentFiles);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
