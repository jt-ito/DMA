import { NextResponse } from 'next/server';
import { getEnvironments, saveEnvironment, deleteEnvironment } from '@/lib/store';
import { EnvironmentSchema, EnvIdSchema } from '@/lib/validations';
import { z } from 'zod';

export async function GET() {
  const envs = getEnvironments();
  return NextResponse.json(envs);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = EnvironmentSchema.parse(body);
    saveEnvironment(validatedData);
    return NextResponse.json({ success: true, environment: validatedData });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error saving environment:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get('id');
  
  if (!rawId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const id = EnvIdSchema.parse(rawId);
    deleteEnvironment(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error deleting environment:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
