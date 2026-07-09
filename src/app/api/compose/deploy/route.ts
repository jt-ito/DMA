import { NextResponse } from 'next/server';
import { getEnvironment, saveEnvironment } from '@/lib/store';
import { deployCompose } from '@/lib/docker';

export async function POST(request: Request) {
  try {
    const { envId, yamlContent, composeFilePath, pruneImages } = await request.json();

    if (!envId || !yamlContent) {
      return NextResponse.json({ error: 'Missing envId or yamlContent' }, { status: 400 });
    }

    const env = getEnvironment(envId);
    if (!env) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    // Save the compose yaml to the environment settings
    env.composeYaml = yamlContent;
    if (composeFilePath !== undefined) {
      env.composeFilePath = composeFilePath;
    }
    if (pruneImages !== undefined) {
      env.pruneImagesOnDeploy = pruneImages;
    }
    saveEnvironment(env);

    // Deploy the compose file
    await deployCompose(env, yamlContent, env.composeFilePath, pruneImages);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
