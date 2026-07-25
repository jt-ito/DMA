import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';

export async function POST(request: Request) {
  try {
    const { envId, path: filePath, content } = await request.json();

    if (!envId || !filePath || content === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    if (env.type === 'local') {
      const fs = await import('fs');
      fs.writeFileSync(filePath, content);
    } else {
      const delimiter = 'EOF_DOCKER_MANAGER_' + Date.now();
      await executeCommand(env, `cat << '${delimiter}' > "${filePath}"\n${content}\n${delimiter}`);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
