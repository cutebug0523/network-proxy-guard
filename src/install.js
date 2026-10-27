import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = {
  agents: ['.agents', 'skills'],
  claude: ['.claude', 'skills'],
  codex: ['.codex', 'skills'],
};

export function installSkill(options = {}) {
  const home = options.home ?? os.homedir();
  const source = fileURLToPath(new URL('../skill/network-proxy-guard/', import.meta.url));
  const root = options.target && !TARGETS[options.target]
    ? path.resolve(options.target)
    : path.join(home, ...(TARGETS[options.target ?? 'agents'] ?? TARGETS.agents));
  const destination = path.join(root, 'network-proxy-guard');
  if (fs.existsSync(destination) && !options.force) {
    throw new Error(`Skill already exists: ${destination}. Use --force to back it up and replace it.`);
  }
  fs.mkdirSync(root, { recursive: true });
  let backup = null;
  if (fs.existsSync(destination)) {
    backup = `${destination}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(destination, backup);
  }
  try {
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    if (backup) fs.renameSync(backup, destination);
    throw error;
  }
  return { destination, backup };
}
