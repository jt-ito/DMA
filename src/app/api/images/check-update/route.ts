import { NextResponse } from 'next/server';
import { getEnvironment } from '@/lib/store';
import { getLocalImageDigest } from '@/lib/docker';
import { EnvIdSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawEnvId = searchParams.get('envId');
  const imageName = searchParams.get('image');
  
  if (!rawEnvId || !imageName) {
    return NextResponse.json({ error: 'Missing envId or image' }, { status: 400 });
  }

  try {
    const envId = EnvIdSchema.parse(rawEnvId);
    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    let repo = imageName;
    let tag = 'latest';
    if (imageName.includes(':')) {
       const parts = imageName.split(':');
       repo = parts[0];
       tag = parts[1];
    }
    if (!repo.includes('/')) {
       repo = 'library/' + repo;
    }

    // 1. Get Token
    const tokenRes = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`);
    if (!tokenRes.ok) return NextResponse.json({ updateAvailable: false, reason: 'failed-token' });
    const { token } = await tokenRes.json();
    
    // 2. Get remote digest
    const manifestRes = await fetch(`https://registry.hub.docker.com/v2/${repo}/manifests/${tag}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json'
      }
    });
    
    const remoteDigest = manifestRes.headers.get('docker-content-digest');
    if (!remoteDigest) return NextResponse.json({ updateAvailable: false, reason: 'no-remote-digest' });
    
    // 3. Get local digest
    const localDigests = await getLocalImageDigest(env, imageName);
    
    // 4. Compare
    let updateAvailable = false;
    if (localDigests.length > 0) {
       updateAvailable = !localDigests.some(d => d.includes(remoteDigest));
    }

    return NextResponse.json({ 
       updateAvailable, 
       remoteDigest, 
       localDigests 
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error checking image update:', error?.message || error);
    return NextResponse.json({ updateAvailable: false, reason: 'error' });
  }
}
