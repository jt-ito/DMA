import fs from 'fs';
import path from 'path';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

export function logAudit(action: string, user: string, ip: string, details: any) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const logFile = path.join(dataDir, 'audit.log');
    
    // Rotate if over 10MB
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = path.join(dataDir, `audit-${Date.now()}.log`);
        fs.renameSync(logFile, backupFile);
        
        // Retention policy: Keep only the 10 most recent rotated backups
        try {
          const MAX_BACKUPS = 10;
          const files = fs.readdirSync(dataDir)
            .filter(f => f.startsWith('audit-') && f.endsWith('.log'))
            .sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)
            
          if (files.length > MAX_BACKUPS) {
            const filesToDelete = files.slice(MAX_BACKUPS);
            filesToDelete.forEach(f => fs.unlinkSync(path.join(dataDir, f)));
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup old audit logs:', cleanupError);
        }
      }
    }

    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      user,
      ip,
      action,
      ...details
    }) + '\n';
    
    fs.appendFileSync(logFile, logEntry, { mode: 0o600 });
    // Ensure permissions are strict even if file already existed
    fs.chmodSync(logFile, 0o600);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
