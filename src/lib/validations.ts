import { z } from 'zod';

export const EnvIdSchema = z.string().uuid().or(z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid environment ID format'));

const ContainerActionSchema = z.enum(['start', 'stop', 'restart', 'remove']);

const ComposeActionSchema = z.enum(['pull', 'pull --ignore-pull-failures', 'up -d', 'stop', 'rm -f', 'prune', 'system-prune', 'rmi', 'down', 'down --rmi all', 'up -d --remove-orphans']);

export const ManageContainerSchema = z.object({
  envId: EnvIdSchema,
  containerId: z.string().regex(/^[a-fA-F0-9]+$/, 'Invalid container ID'),
  action: ContainerActionSchema,
});

export const ComposeCommandSchema = z.object({
  envId: EnvIdSchema,
  action: ComposeActionSchema,
  workingDir: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\:\ \~\(\)\[\]\@\+\=\,]+$/, 'Invalid working directory format').optional(),
  serviceName: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid service name').optional(),
  imageName: z.string().regex(/^[a-zA-Z0-9_:\/\.\-\@]+$/, 'Invalid image name').optional(),
  configFiles: z.string().regex(/^[a-zA-Z0-9_\\\/\-\.\,\:\ \~\(\)\[\]\@\+\=]+$/, 'Invalid config files format').optional(),
  environmentFiles: z.string().regex(/^[a-zA-Z0-9_\\\/\-\.\,\:\ \~\(\)\[\]\@\+\=]+$/, 'Invalid env files format').optional(),
});

export const EnvironmentSchema = z.object({
  id: EnvIdSchema,
  name: z.string().min(1).max(100),
  type: z.enum(['local', 'remote']),
  host: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  composeYaml: z.string().optional(),
  composeFilePath: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\~\:\ \(\)\[\]\@\+\=\,]+$/, 'Invalid path format').optional(),
  pruneImagesOnDeploy: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

export const FsListSchema = z.object({
  envId: EnvIdSchema,
  path: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\~\:\ \(\)\[\]\@\+\=\,]+$/, 'Invalid path format').optional(),
});

export const FsReadSchema = z.object({
  envId: EnvIdSchema,
  path: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\~\:\ \(\)\[\]\@\+\=\,]+$/, 'Invalid path format'),
});

export const FsCopySchema = z.object({
  envId: EnvIdSchema,
  src: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\~\:\ \(\)\[\]\@\+\=\,]+$/, 'Invalid path format'),
  dest: z.string().min(1).max(1024).regex(/^[a-zA-Z0-9_\\\/\-\.\~\:\ \(\)\[\]\@\+\=\,]+$/, 'Invalid path format'),
});

export const DebugCommandSchema = z.object({
  envId: EnvIdSchema,
  command: z.string().min(1).max(1024), // Cannot restrict too much since it's debug, but we sanitize inputs
  cwd: z.string().optional(),
});

export const ContainerPolicySchema = z.object({
  envId: EnvIdSchema,
  containerId: z.string().regex(/^[a-fA-F0-9]+$/, 'Invalid container ID'),
  policy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']),
});
