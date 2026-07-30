import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { updateRestartPolicy } from '@/lib/docker';
import { ContainerPolicySchema } from '@/lib/validations';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = ContainerPolicySchema.parse(body);
    const { envId, containerId, policy } = validatedData;
    
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }
    
    await updateRestartPolicy(env, containerId, policy);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error updating restart policy:', error?.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
