import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';

export async function POST(request: Request) {
  try {
    const { envId, command, cwd } = await request.json();
    const env = getEnvironment(envId);
    if (!env) return NextResponse.json({ error: 'Env not found' }, { status: 404 });
    
    const result = await executeCommand(env, command, cwd);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
