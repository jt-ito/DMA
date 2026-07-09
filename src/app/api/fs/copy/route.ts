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
    
    // Replace leading ~ with $HOME
    const expandedSrc = src.replace(/^~/, '$HOME');
    const expandedDest = dest.replace(/^~/, '$HOME');
    
    // Run copy command
    const command = `bash -c 'cp "${expandedSrc}" "${expandedDest}"'`;
    await executeCommand(env, command);
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error in fs copy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
