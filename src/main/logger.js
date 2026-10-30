import fs from 'node:fs';
import path from 'node:path';

export function createLogger(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'questflow.log');
  try {
    if (fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.1');
  } catch {}
  const write = (level, msg) => {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
    try { fs.appendFileSync(file, line); } catch {}
    if (process.env.QF_DEBUG) process.stdout.write(line);
  };
  return {
    file,
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
  };
}
