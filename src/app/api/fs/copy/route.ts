import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { envId, src, dest } = body;
    
    if (!envId || !src || !dest) {
      return NextResponse.json({ error: 'Missing envId, src, or dest' }, { status: 400 });
    }
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    // Replace leading ~ with $HOME
    const expandedSrc = src.replace(/^~/, '$HOME');
    const expandedDest = dest.replace(/^~/, '$HOME');
    
    // Run copy command
    const command = `bash -c 'cp "${expandedSrc}" "${expandedDest}"'`;
    await executeCommand(env, command);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
