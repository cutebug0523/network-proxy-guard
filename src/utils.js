import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);
export const homeDir = () => os.homedir();
export const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function expandHome(value) {
  if (!value) return value;
  if (value === '~') return homeDir();
  if (value.startsWith('~/')) return path.join(homeDir(), value.slice(2));
  return value;
}

export function exists(target) {
  return fs.existsSync(target);
}

export function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

export function ensurePrivateDir(target) {
  ensureDir(target);
  fs.chmodSync(target, 0o700);
}

export function atomicWrite(target, content, mode = 0o600) {
  ensureDir(path.dirname(target));
  const temporary = `${target}.npg-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, content, { mode });
    fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export function relativeDisplay(target, home = homeDir()) {
  const relative = path.relative(home, target);
  return relative && !relative.startsWith('..') ? `~/${relative}` : target;
}

export function redactUrl(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = '***';
      url.password = '***';
    }
    return url.toString();
  } catch {
    return value.replace(/\/\/[^\s/@]+@/, '//***@');
  }
}

export function publicEnv(env = process.env) {
  const names = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'];
  const result = {};
  for (const name of names) {
    const value = env[name] ?? env[name.toLowerCase()];
    if (value) result[name] = name === 'NO_PROXY' ? value : redactUrl(value);
  }
  return result;
}

export async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options.timeout ?? 15_000,
      maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
      env: options.env ?? process.env,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message,
      code: typeof error.code === 'number' ? error.code : null,
    };
  }
}

export function assertInsideHome(target, home) {
  const resolvedHome = path.resolve(home);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedHome && !resolvedTarget.startsWith(`${resolvedHome}${path.sep}`)) {
    throw new Error(`Refusing to touch a path outside HOME: ${resolvedTarget}`);
  }
}
