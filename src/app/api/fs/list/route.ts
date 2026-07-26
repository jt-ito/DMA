import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { executeCommand } from '@/lib/executor';
import { FsListSchema } from '@/lib/validations';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = FsListSchema.parse(body);
    const { envId, path = '~' } = validatedData;
    
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
      
      const dirents = await fs.readdir(actualPath, { withFileTypes: true }).catch(() => []);
      const items = dirents.map(dirent => {
        return {
          name: dirent.name,
          isDir: dirent.isDirectory()
        };
      }).filter(item => item.name !== '.' && item.name !== '..');
      
      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      
      return NextResponse.json({ items, actualPath: actualPath.replace(/\\/g, '/') });
    }
    
    // Replace leading ~ with $HOME so bash evaluates it properly inside double quotes
    const expandedPath = path.replace(/^~/, '$HOME');
    
    // We use bash -c to ensure we can handle ~ properly and cd into the directory.
    // ls -1pa outputs one per line, with trailing slashes for directories, including hidden.
    const command = `bash -c 'cd "${expandedPath}" && pwd && ls -1pa'`;
    const { stdout } = await executeCommand(env, command);
    
    const lines = stdout.trim().split('\n').filter(line => line.length > 0);
    // The first line will be the actual absolute path from `pwd`
    const actualPath = lines.shift() || path;
    
    const items = lines.map(line => {
      const isDir = line.endsWith('/');
      const name = isDir ? line.slice(0, -1) : line;
      return { name, isDir };
    }).filter(item => item.name !== '.' && item.name !== '..');
    
    // Sort directories first
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
    
    return NextResponse.json({ items, actualPath });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error listing fs:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
