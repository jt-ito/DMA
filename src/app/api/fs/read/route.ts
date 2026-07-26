import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';
import { FsReadSchema } from '@/lib/validations';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = FsReadSchema.parse(body);
    const { envId, path } = validatedData;
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    if (env.type === 'local') {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const os = await import('os');
      const expandedPath = path.startsWith('~') ? path.replace(/^~/, os.homedir()) : path;
      const actualPath = pathModule.resolve(expandedPath);
      const content = await fs.readFile(actualPath, 'utf8');
      return NextResponse.json({ content });
    }

    // Replace leading ~ with $HOME
    const expandedPath = path.replace(/^~/, '$HOME');
    
    // Read file contents
    const command = `bash -c 'cat "${expandedPath}"'`;
    const { stdout } = await executeCommand(env, command);
    
    return NextResponse.json({ content: stdout });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    
    // Check if the error is ENOENT (file not found)
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    console.error('Error reading fs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
