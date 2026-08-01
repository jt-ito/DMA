import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import os from "os";

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const configDir = path.join(process.env.USERPROFILE || process.env.HOME || process.cwd(), '.docker-manager');
const envPath = path.join(configDir, '.env');

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
      else if (value.startsWith("'") && value.endsWith("'")) value = value.replace(/^'|'$/g, '');
      process.env[match[1]] = value;
    }
  });
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ssh2", "node-ssh"],
  poweredByHeader: false,
  // @ts-ignore - property might be missing in Next.js types
  allowedDevOrigins: getLocalIps(),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
