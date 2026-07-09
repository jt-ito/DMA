import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { envId, path } = body;
    
    if (!envId || !path) {
      return NextResponse.json({ error: 'Missing envId or path' }, { status: 400 });
    }
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    // Replace leading ~ with $HOME
    const expandedPath = path.replace(/^~/, '$HOME');
    
    // Read file contents
    const command = `bash -c 'cat "${expandedPath}"'`;
    const { stdout } = await executeCommand(env, command);
    
    return NextResponse.json({ content: stdout });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
