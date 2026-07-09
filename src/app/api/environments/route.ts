import { NextResponse } from 'next/server';
import { getEnvironments, saveEnvironment, deleteEnvironment } from '@/lib/store';

export async function GET() {
  const envs = getEnvironments();
  return NextResponse.json(envs);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.id || !body.name || !body.type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  saveEnvironment(body);
  return NextResponse.json({ success: true, environment: body });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  deleteEnvironment(id);
  return NextResponse.json({ success: true });
}
