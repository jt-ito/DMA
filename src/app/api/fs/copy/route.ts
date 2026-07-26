import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';
import { FsCopySchema } from '@/lib/validations';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = FsCopySchema.parse(body);
    const { envId, src, dest } = validatedData;
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    if (env.type === 'local') {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      const os = await import('os');
      const expandedSrc = src.startsWith('~') ? src.replace(/^~/, os.homedir()) : src;
      const expandedDest = dest.startsWith('~') ? dest.replace(/^~/, os.homedir()) : dest;
      const actualSrc = pathModule.resolve(expandedSrc);
      const actualDest = pathModule.resolve(expandedDest);
      await fs.copyFile(actualSrc, actualDest);
    } else {
      // Replace leading ~ with $HOME
      const expandedSrc = src.replace(/^~/, '$HOME');
      const expandedDest = dest.replace(/^~/, '$HOME');
      
      // Run copy command
      const command = `bash -c 'cp "${expandedSrc}" "${expandedDest}"'`;
      await executeCommand(env, command);
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error in fs copy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
