import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';
import { ContainerExecSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ContainerExecSchema.parse(body);
    const { envId, containerId, command } = parsed;

    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    // Use sh -c to execute the arbitrary command string
    // e.g., docker exec -i <container_id> sh -c "<command>"
    // Note: We use -i so it expects input and behaves somewhat like a shell, but we don't allocate a TTY (-t) because it's an API.
    const result = await executeCommand(env, 'docker', ['exec', '-i', containerId, 'sh', '-c', command]);

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Exec error:', error?.message || error);
    
    // We return stdout and stderr even on failure because the command might have failed inside the container, 
    // and we want to show that error to the user in the UI.
    const stdout = error.stdout || '';
    const stderr = error.stderr || error.message || String(error);
    
    return NextResponse.json({ 
      success: false,
      error: 'Command execution failed', 
      result: { stdout, stderr, code: error.code } 
    }, { status: 200 });
  }
}
