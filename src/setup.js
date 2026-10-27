import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { buildMihomoProfile } from './node-config.js';
import {
  atomicWrite, ensureDir, ensurePrivateDir, exists, homeDir,
  relativeDisplay, run, timestamp,
} from './utils.js';

export const defaultVergeDir = (home = homeDir()) => path.join(
  home, 'Library', 'Application Support', 'io.github.clash-verge-rev.clash-verge-rev',
);

function parseYamlFile(file, fallback = {}) {
  if (!exists(file)) return fallback;
  const parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : fallback;
}

function uidFor(node) {
  const digest = crypto.createHash('sha256')
    .update(`${node.name}\0${node.address}\0${node.port}`)
    .digest('hex').slice(0, 12);
  return `npg-${digest}`;
}

async function defaultIsRunning() {
  if (process.platform !== 'darwin') return false;
  const result = await run('pgrep', ['-f', 'Clash Verge'], { timeout: 3000 });
  return result.ok;
}

async function defaultStop() {
  const result = await run('osascript', ['-e', 'tell application "Clash Verge" to quit']);
  if (!result.ok) throw new Error(`Could not quit Clash Verge: ${result.stderr}`);
}

async function defaultStart() {
  const result = await run('open', ['-a', 'Clash Verge']);
  if (!result.ok) throw new Error(`Could not reopen Clash Verge: ${result.stderr}`);
}

async function defaultTunReady() {
  return exists('/Library/PrivilegedHelperTools/clash-verge-service')
    && exists('/Library/Application Support/clash-verge-service');
}

async function defaultValidate(profileFile, content) {
  const candidates = [
    process.env.MIHOMO_BIN,
    '/Library/Application Support/clash-verge-service/cores/mihomo',
    '/Library/Application Support/clash-verge-service/cores/clash-meta',
    '/Applications/Clash Verge.app/Contents/Resources/sidecar/mihomo',
    '/Applications/Clash Verge.app/Contents/Resources/sidecar/clash-meta',
  ].filter(Boolean);
  let binary = candidates.find(exists);
  if (!binary) {
    const found = await run('sh', ['-c', 'command -v mihomo || command -v clash-meta'], { timeout: 3000 });
    if (found.ok && found.stdout.trim()) binary = found.stdout.trim().split('\n')[0];
  }
  if (!binary) return { skipped: true, ok: false, reason: 'mihomo binary not found; YAML validated only' };
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-validate-'));
  const candidate = path.join(temporary, 'candidate.yaml');
  fs.writeFileSync(candidate, content, { mode: 0o600 });
  const result = await run(binary, ['-t', '-f', candidate], { timeout: 20_000 });
  fs.rmSync(temporary, { recursive: true, force: true });
  return {
    skipped: false,
    ok: result.ok,
    command: binary,
    reason: result.ok ? 'mihomo configuration test passed' : result.stderr || result.stdout,
  };
}

function makeChange(file, content, vergeDir) {
  if (exists(file) && fs.lstatSync(file).isSymbolicLink()) {
    throw new Error(`Refusing to replace a symlinked Clash config: ${file}`);
  }
  return {
    file,
    content,
    relative: path.relative(vergeDir, file),
    original: exists(file) ? fs.readFileSync(file) : null,
  };
}

export async function setupProxy(options) {
  const home = options.home ?? homeDir();
  const vergeDir = path.resolve(options.vergeDir ?? defaultVergeDir(home));
  const node = options.node;
  const restart = Boolean(options.restart);
  const yes = Boolean(options.yes);
  const runtime = options.runtime ?? {};
  const isRunning = runtime.isRunning ?? defaultIsRunning;
  const validate = runtime.validate ?? defaultValidate;
  const stop = runtime.stop ?? defaultStop;
  const start = runtime.start ?? defaultStart;
  if (!exists(vergeDir)) throw new Error(`Clash Verge config directory not found: ${vergeDir}`);

  const profilesFile = path.join(vergeDir, 'profiles.yaml');
  const configFile = path.join(vergeDir, 'config.yaml');
  const vergeFile = path.join(vergeDir, 'verge.yaml');
  const profiles = parseYamlFile(profilesFile, { current: null, items: [] });
  if (!Array.isArray(profiles.items)) throw new Error('profiles.yaml has no valid items array');
  const baseConfig = parseYamlFile(configFile, {});
  const vergeConfig = parseYamlFile(vergeFile, {});
  const uid = uidFor(node);
  const profileName = `${uid}.yaml`;
  const profileFile = path.join(vergeDir, 'profiles', profileName);
  const item = {
    uid,
    type: 'local',
    name: node.name,
    desc: 'Managed by network-proxy-guard',
    file: profileName,
    updated: Math.floor(Date.now() / 1000),
  };
  const retained = profiles.items.filter((entry) => entry?.uid !== uid);
  const nextProfiles = { ...profiles, current: uid, items: [item, ...retained] };
  const nextBaseConfig = { ...baseConfig, mode: 'rule', ipv6: false };
  const nextVergeConfig = {
    ...vergeConfig,
    enable_system_proxy: true,
    proxy_auto_config: false,
  };
  if (options.enableTun) nextVergeConfig.enable_tun_mode = true;

  const changes = [
    makeChange(profileFile, YAML.stringify(buildMihomoProfile(node)), vergeDir),
    makeChange(profilesFile, YAML.stringify(nextProfiles), vergeDir),
    makeChange(configFile, YAML.stringify(nextBaseConfig), vergeDir),
  ];
  if (exists(vergeFile)) changes.push(makeChange(vergeFile, YAML.stringify(nextVergeConfig), vergeDir));

  const running = await isRunning();
  const tunReady = options.enableTun
    ? await (runtime.checkTun ?? defaultTunReady)()
    : null;
  const warnings = [];
  if (!exists(vergeFile)) warnings.push('verge.yaml not found; system proxy settings must be checked in the UI');
  if (!exists(configFile)) warnings.push('config.yaml not found; a minimal rule-mode config will be created');
  if (running && !restart) warnings.push('Clash Verge is running; apply requires --restart or a manually quit app');
  if (running && restart) warnings.push('Clash Verge will be quit and reopened');
  if (options.enableTun) {
    warnings.push(tunReady
      ? 'TUN was requested; IPC, routes, DNS and UDP still require post-change verification'
      : 'TUN privileged service was not detected');
  }

  const plan = {
    mode: yes ? 'apply' : 'dry-run',
    vergeDir,
    activate: uid,
    preserveProfiles: retained.length,
    mixedPort: vergeConfig.verge_mixed_port ?? baseConfig['mixed-port'] ?? baseConfig.port ?? null,
    tun: options.enableTun ? 'enable' : vergeConfig.enable_tun_mode ? 'unchanged-on' : 'unchanged-off',
    tunService: tunReady === null ? undefined : tunReady ? 'detected' : 'missing',
    files: changes.map((change) => change.relative),
    running,
    warnings,
  };
  if (!yes) return { plan, validation: null, backup: null };
  if (options.enableTun && !tunReady) {
    throw new Error('TUN privileged service is not ready; no files were changed');
  }
  if (running && !restart) throw new Error('Quit Clash Verge first, or explicitly authorize --restart');

  const validation = await validate(profileFile, changes[0].content);
  if (!validation.ok && !validation.skipped) {
    throw new Error(`Generated profile failed validation: ${validation.reason}`);
  }
  if (restart && running) {
    await stop();
    for (let attempt = 0; attempt < 20 && await isRunning(); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (await isRunning()) throw new Error('Clash Verge did not stop; no files were changed');
  }

  const backup = path.join(home, '.network-proxy-guard', 'backups', `setup-${timestamp()}`);
  const applied = [];
  try {
    ensurePrivateDir(backup);
    for (const change of changes) {
      if (change.original) {
        const backupFile = path.join(backup, 'original', change.relative);
        ensureDir(path.dirname(backupFile));
        fs.writeFileSync(backupFile, change.original, { mode: 0o600 });
      }
    }
    for (const change of changes) {
      atomicWrite(change.file, change.content);
      applied.push(change);
    }
    const manifest = {
      createdAt: new Date().toISOString(),
      vergeDir,
      files: changes.map((change) => ({ path: change.relative, existed: Boolean(change.original) })),
    };
    atomicWrite(path.join(backup, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    for (const change of applied.reverse()) {
      if (change.original) atomicWrite(change.file, change.original);
      else fs.rmSync(change.file, { force: true });
    }
    if (restart && running) {
      try {
        await start();
      } catch (startError) {
        error.message += `; rollback completed but Clash Verge reopen failed: ${startError.message}`;
      }
    }
    throw error;
  }
  let restartWarning = null;
  if (restart && running) {
    try {
      await start();
    } catch (error) {
      restartWarning = `Configuration applied, but Clash Verge reopen failed: ${error.message}`;
    }
  }
  return {
    plan: {
      ...plan,
      mode: 'applied',
      warnings: restartWarning ? [...warnings, restartWarning] : warnings,
    },
    validation,
    backup: relativeDisplay(backup, home),
  };
}

export function printablePlan(result) {
  const { plan, validation, backup } = result;
  return {
    ...plan,
    validation: validation ? (validation.ok ? 'passed' : validation.skipped ? 'YAML only' : 'failed') : 'not run (dry-run)',
    backup,
  };
}
