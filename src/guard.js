import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import {
  atomicWrite, ensureDir, ensurePrivateDir, exists, homeDir,
  relativeDisplay, timestamp,
} from './utils.js';

function readYaml(file, fallback = {}) {
  if (!exists(file)) return fallback;
  const parsed = YAML.parse(fs.readFileSync(file, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : fallback;
}

function currentProfile(vergeDir) {
  const file = path.join(vergeDir, 'profiles.yaml');
  const profiles = readYaml(file, { items: [] });
  const items = Array.isArray(profiles.items) ? profiles.items : [];
  const item = items.find((entry) => entry?.uid === profiles.current);
  if (!item?.file) return { item: null, profile: null, file: null };
  if (path.basename(item.file) !== item.file) return { item, profile: null, file: null, unsafe: true };
  const profileFile = path.join(vergeDir, 'profiles', item.file);
  return { item, profile: readYaml(profileFile, null), file: item.file };
}

export function auditVerge(vergeDir) {
  const violations = [];
  const warnings = [];
  const checked = { mode: null, ipv6: null, pac: null, profile: null, domesticDirect: null };
  const configFile = path.join(vergeDir, 'config.yaml');
  const vergeFile = path.join(vergeDir, 'verge.yaml');
  const config = readYaml(configFile, null);
  if (!config) {
    violations.push({ code: 'config-missing', repairable: true, message: 'config.yaml is missing; rule mode and IPv6 cannot be verified' });
  } else {
    checked.mode = config.mode ?? null;
    checked.ipv6 = config.ipv6 ?? null;
    if (config.mode !== 'rule') violations.push({ code: 'mode-not-rule', repairable: true, message: `Expected mode=rule, found ${config.mode ?? 'missing'}` });
    if (config.ipv6 !== false) violations.push({ code: 'ipv6-enabled', repairable: true, message: `Expected ipv6=false, found ${config.ipv6 ?? 'missing'}` });
  }
  const verge = readYaml(vergeFile, null);
  if (!verge) {
    warnings.push('verge.yaml is missing; PAC and app preferences cannot be fully verified');
  } else {
    checked.pac = verge.proxy_auto_config ?? null;
    if (verge.proxy_auto_config === true) {
      violations.push({ code: 'pac-enabled', repairable: true, message: 'PAC is enabled and may contain a DIRECT fallback' });
    }
  }

  const { item, profile, file, unsafe } = currentProfile(vergeDir);
  checked.profile = item?.name ?? item?.uid ?? null;
  if (unsafe) {
    violations.push({ code: 'unsafe-profile-file', repairable: false, message: 'Current profile file escapes the profiles directory' });
  } else if (!item || !profile) {
    violations.push({ code: 'profile-missing', repairable: false, message: 'Current local profile could not be loaded' });
  } else {
    checked.profile = file;
    const rules = Array.isArray(profile.rules) ? profile.rules.filter((rule) => typeof rule === 'string') : [];
    checked.domesticDirect = rules.some((rule) => /^(?:GEOSITE,CN,DIRECT|GEOIP,CN,DIRECT)(?:,|$)/.test(rule));
    if (!checked.domesticDirect) {
      violations.push({ code: 'domestic-direct-missing', repairable: false, message: 'Current profile has no GEOSITE/GEOIP CN DIRECT rule' });
    }
    if (rules.some((rule) => /^MATCH,DIRECT(?:,|$)/.test(rule))) {
      violations.push({ code: 'match-direct', repairable: false, message: 'Current profile sends all unmatched traffic to DIRECT' });
    }
    const groups = Array.isArray(profile['proxy-groups']) ? profile['proxy-groups'] : [];
    for (const group of groups) {
      if (['fallback', 'url-test'].includes(group?.type) && Array.isArray(group.proxies) && group.proxies.includes('DIRECT')) {
        violations.push({ code: 'auto-direct-fallback', repairable: false, message: `Automatic DIRECT fallback in group ${group.name ?? 'unnamed'}` });
      }
    }
  }
  return { ok: violations.length === 0, checked, violations, warnings };
}

function changeFor(file, updates) {
  const current = readYaml(file, {});
  const next = { ...current, ...updates };
  if (JSON.stringify(current) === JSON.stringify(next)) return null;
  if (exists(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(`Refusing symlinked guard config: ${file}`);
  return {
    file,
    content: YAML.stringify(next),
    original: exists(file) ? fs.readFileSync(file) : null,
  };
}

function repairVerge(vergeDir, home) {
  const changes = [
    changeFor(path.join(vergeDir, 'config.yaml'), { mode: 'rule', ipv6: false }),
    exists(path.join(vergeDir, 'verge.yaml'))
      ? changeFor(path.join(vergeDir, 'verge.yaml'), { proxy_auto_config: false })
      : null,
  ].filter(Boolean);
  if (!changes.length) return { backup: null, changed: [] };
  const backup = path.join(home, '.network-proxy-guard', 'backups', `guard-${timestamp()}`);
  const applied = [];
  try {
    ensurePrivateDir(backup);
    for (const change of changes) {
      if (change.original) {
        const target = path.join(backup, 'original', path.basename(change.file));
        ensureDir(path.dirname(target));
        fs.writeFileSync(target, change.original, { mode: 0o600 });
      }
    }
    for (const change of changes) {
      atomicWrite(change.file, change.content);
      applied.push(change);
    }
  } catch (error) {
    for (const change of applied.reverse()) {
      if (change.original) atomicWrite(change.file, change.original);
      else fs.rmSync(change.file, { force: true });
    }
    throw error;
  }
  return { backup: relativeDisplay(backup, home), changed: changes.map((change) => path.basename(change.file)) };
}

export function guardOnce(options = {}) {
  const vergeDir = path.resolve(options.vergeDir);
  const home = options.home ?? homeDir();
  const before = auditVerge(vergeDir);
  if (!options.enforce) return { ...before, mode: 'audit', backup: null };
  if (!options.yes) return { ...before, mode: 'dry-run', backup: null };
  const repair = repairVerge(vergeDir, home);
  const after = auditVerge(vergeDir);
  return { ...after, before, mode: 'enforce', ...repair };
}

export function watchGuard(options) {
  let busy = false;
  let previous = null;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const result = guardOnce(options);
      const signature = JSON.stringify(result);
      if (signature !== previous) {
        previous = signature;
        options.onResult?.(result);
      }
    } catch (error) {
      options.onError?.(error);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(tick, options.intervalMs ?? 2000);
  tick();
  return timer;
}
