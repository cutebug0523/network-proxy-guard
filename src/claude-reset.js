import fs from 'node:fs';
import path from 'node:path';
import {
  assertInsideHome, atomicWrite, ensureDir, ensurePrivateDir, exists,
  homeDir, relativeDisplay, run, timestamp,
} from './utils.js';

const SHELL_FILES = [
  '.zshrc', '.zprofile', '.bashrc', '.bash_profile', '.profile',
  '.config/fish/config.fish',
];
const LIBRARY_DIRS = [
  'Application Support', 'Caches', 'Preferences', 'HTTPStorages',
  'WebKit', 'Logs', 'Saved Application State', 'LaunchAgents',
];
const TRACE_NAME = /claude|cc[._ -]?switch|com\.anthropic\./i;
const ENV_NAME = '(?:ANTHROPIC_[A-Z0-9_]+|CLAUDE_[A-Z0-9_]+|CC[._]?SWITCH[A-Z0-9_]*)';
const SHELL_ENV = new RegExp(`^\\s*(?:export\\s+)?${ENV_NAME}\\s*=`);
const FISH_ENV = new RegExp(`^\\s*set\\s+(?:-[A-Za-z]+\\s+)*${ENV_NAME}\\b`);
const LAUNCH_ENV = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL', 'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
];

function sharedSkillDirs(home) {
  const claudeDir = path.join(home, '.claude');
  if (!exists(claudeDir) || fs.lstatSync(claudeDir).isSymbolicLink()) return [];
  return fs.readdirSync(claudeDir)
    .filter((entry) => entry.toLowerCase() === 'skills')
    .map((entry) => path.join(claudeDir, entry));
}

function canonical(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function related(left, right) {
  return left === right
    || left.startsWith(`${right}${path.sep}`)
    || right.startsWith(`${left}${path.sep}`);
}

function assertSafeTarget(target, protectedPaths) {
  const resolved = path.resolve(target);
  const real = canonical(resolved);
  for (const protectedPath of protectedPaths) {
    if (related(resolved, path.resolve(protectedPath)) || related(real, canonical(protectedPath))) {
      throw new Error(`Refusing protected or shared path: ${resolved}`);
    }
  }
}

function addTarget(set, target, protectedPaths) {
  if (!exists(target)) return;
  const resolved = path.resolve(target);
  assertSafeTarget(resolved, protectedPaths);
  set.add(resolved);
}

function scanTargets(home, extraPaths = []) {
  const targets = new Set();
  const claudeDir = path.join(home, '.claude');
  if (exists(claudeDir) && fs.lstatSync(claudeDir).isSymbolicLink()) {
    throw new Error('Refusing to traverse a symlinked ~/.claude; review it manually');
  }
  const skillDirs = sharedSkillDirs(home);
  const scanProtected = [
    ...skillDirs, path.join(home, '.agents'), path.join(home, '.codex'),
    path.join(home, '.network-proxy-guard'),
  ];
  if (exists(claudeDir)) {
    for (const entry of fs.readdirSync(claudeDir)) {
      if (entry.toLowerCase() !== 'skills') addTarget(targets, path.join(claudeDir, entry), scanProtected);
    }
  }
  addTarget(targets, path.join(home, '.claude.json'), scanProtected);
  addTarget(targets, path.join(home, '.cc-switch'), scanProtected);
  for (const directory of LIBRARY_DIRS) {
    const parent = path.join(home, 'Library', directory);
    if (!exists(parent)) continue;
    for (const entry of fs.readdirSync(parent)) {
      if (TRACE_NAME.test(entry)) addTarget(targets, path.join(parent, entry), scanProtected);
    }
  }
  const extraProtected = [claudeDir, ...scanProtected];
  for (const extra of extraPaths) {
    const resolved = path.resolve(extra);
    assertInsideHome(resolved, home);
    if (resolved === path.resolve(home)) throw new Error('Refusing to reset HOME itself');
    if (!/claude|cc[._ -]?switch|anthropic/i.test(path.basename(resolved))) {
      throw new Error(`Extra path must be a specifically named Claude/Anthropic/CC Switch item: ${resolved}`);
    }
    addTarget(targets, resolved, extraProtected);
  }
  const sorted = [...targets].sort();
  return sorted.filter((target) => !sorted.some((parent) => parent !== target && target.startsWith(`${parent}${path.sep}`)));
}

function shellPlan(home) {
  const edits = [];
  const warnings = [];
  for (const relative of SHELL_FILES) {
    const file = path.join(home, relative);
    if (!exists(file)) continue;
    if (fs.lstatSync(file).isSymbolicLink()) {
      warnings.push(`Symlinked shell file needs manual review: ${relative}`);
      continue;
    }
    const original = fs.readFileSync(file, 'utf8');
    const lines = original.split(/(?<=\n)/);
    const content = lines.filter((line) => !SHELL_ENV.test(line) && !FISH_ENV.test(line)).join('');
    const removed = lines.filter((line) => SHELL_ENV.test(line) || FISH_ENV.test(line)).length;
    if (content !== original) edits.push({ file, relative, original, content, removed });
  }
  return { edits, warnings };
}

async function defaultLaunchEnv(home) {
  if (process.platform !== 'darwin' || home !== homeDir()) return [];
  const set = [];
  for (const name of LAUNCH_ENV) {
    const result = await run('launchctl', ['getenv', name], { timeout: 3000 });
    if (result.ok && result.stdout.trim()) set.push(name);
  }
  return set;
}

async function defaultUnsetLaunchEnv(name) {
  const result = await run('launchctl', ['unsetenv', name], { timeout: 3000 });
  if (!result.ok) throw new Error(`Could not unset launchd variable ${name}`);
}

export async function resetClaude(options = {}) {
  const home = path.resolve(options.home ?? homeDir());
  const yes = Boolean(options.yes);
  const extraPaths = options.extraPaths ?? [];
  const targets = scanTargets(home, extraPaths);
  const { edits, warnings } = shellPlan(home);
  const launchEnv = await (options.runtime?.listLaunchEnv ?? defaultLaunchEnv)(home);
  const unsetLaunchEnv = options.runtime?.unsetLaunchEnv ?? defaultUnsetLaunchEnv;
  const preserved = [...sharedSkillDirs(home), path.join(home, '.agents'), path.join(home, '.codex')]
    .filter(exists).map((target) => relativeDisplay(target, home));
  const plan = {
    mode: yes ? 'apply' : 'dry-run',
    targets: targets.map((target) => relativeDisplay(target, home)),
    shellEdits: edits.map((edit) => ({ file: edit.relative, removedLines: edit.removed })),
    launchEnv,
    preserved,
    programs: 'preserved; reset does not uninstall Claude Code or desktop apps',
    warnings: [
      ...warnings,
      'Local reset does not revoke service-side tokens',
      'A local backup will retain the removed data until you delete it yourself',
    ],
  };
  if (!yes) return { plan, backup: null };
  if (!targets.length && !edits.length && !launchEnv.length) return { plan: { ...plan, mode: 'no-op' }, backup: null };

  const backup = path.join(home, '.network-proxy-guard', 'backups', `claude-reset-${timestamp()}`);
  const moved = [];
  const edited = [];
  const launchCleared = [];
  try {
    ensurePrivateDir(backup);
    for (const target of targets) {
      const relative = path.relative(home, target);
      const destination = path.join(backup, 'files', relative);
      ensureDir(path.dirname(destination));
      fs.renameSync(target, destination);
      moved.push({ target, destination });
    }
    for (const edit of edits) {
      const destination = path.join(backup, 'shell', edit.relative);
      ensureDir(path.dirname(destination));
      fs.writeFileSync(destination, edit.original, { mode: 0o600 });
      atomicWrite(edit.file, edit.content);
      edited.push({ ...edit, destination });
    }
  } catch (error) {
    for (const edit of edited.reverse()) atomicWrite(edit.file, edit.original);
    for (const { target, destination } of moved.reverse()) {
      ensureDir(path.dirname(target));
      fs.renameSync(destination, target);
    }
    throw error;
  }
  const launchEnvFailed = [];
  for (const name of launchEnv) {
    try {
      await unsetLaunchEnv(name);
      launchCleared.push(name);
    } catch {
      launchEnvFailed.push(name);
    }
  }
  const resultWarnings = [...warnings];
  if (launchEnvFailed.length) resultWarnings.push(`Could not clear launchd variables: ${launchEnvFailed.join(', ')}`);
  const manifest = {
    createdAt: new Date().toISOString(),
    moved: moved.map(({ target }) => relativeDisplay(target, home)),
    shellEdited: edited.map(({ relative }) => relative),
    launchEnvCleared: launchCleared,
    launchEnvFailed,
    preserved,
  };
  try {
    atomicWrite(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    resultWarnings.push(`Could not write backup manifest: ${error.message}`);
  }
  return {
    plan: {
      ...plan,
      mode: 'applied',
      launchEnvCleared: launchCleared,
      launchEnvFailed,
      warnings: resultWarnings,
    },
    backup: relativeDisplay(backup, home),
  };
}
