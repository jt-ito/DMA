import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: 'Missing environment ID' }, { status: 400 });
  }

  const env = getEnvironment(id);
  if (!env) {
    return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
  }

  try {
    let ip = '';
    if (env.type === 'local') {
      const res = await fetch('https://api.ipify.org');
      if (res.ok) {
        ip = await res.text();
      } else {
        throw new Error('Failed to fetch from ipify.org');
      }
    } else {
      const { stdout } = await executeCommand(env, 'curl -s https://api.ipify.org');
      ip = stdout.trim();
    }

    if (!ip) {
      throw new Error('Empty IP returned');
    }

    return NextResponse.json({ success: true, ip });
  } catch (error: any) {
    console.error('Error fetching IP:', error);
    return NextResponse.json({ error: 'Failed to pull IP address' }, { status: 500 });
  }
}
