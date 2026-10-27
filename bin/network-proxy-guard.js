#!/usr/bin/env node
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { installSkill } from '../src/install.js';
import { readNodeConfig, buildMihomoProfile } from '../src/node-config.js';
import { setupProxy, printablePlan, defaultVergeDir } from '../src/setup.js';
import { guardOnce, watchGuard } from '../src/guard.js';
import { generateMobileQr } from '../src/qr.js';
import { resetClaude } from '../src/claude-reset.js';
import { detectGoogleRegion, buildLisaTicket, probeNetwork } from '../src/diagnostics.js';
import { atomicWrite, expandHome } from '../src/utils.js';
import { REFERENCE_ENVIRONMENT } from '../src/reference.js';

const HELP = `network-proxy-guard

Install the agent skill (no proxy/Claude changes):
  npx network-proxy-guard@latest install --target agents
  npx network-proxy-guard@latest install --target claude
  npx network-proxy-guard@latest install --target codex

Commands:
  guard         Audit rule/IPv6/PAC/domestic-DIRECT invariants [--verge-dir DIR]
                Optional: --watch --enforce --yes (repair only with explicit approval)
  reference     Show the non-mandatory LisaHost reference environment
  install       Install only the skill files [--target agents|claude|codex|DIR] [--force]
  setup         Preview Clash Verge setup; --config FILE [--yes] [--restart]
                Optional: --verge-dir DIR --enable-tun --qr-dir DIR
  export-profile Generate YAML only for official UI import --config FILE --output FILE
  probe         Read-only network probe [--url URL] [--proxy URL] [--offline]
  google-region Check Google/IP geolocation [--ssh-target USER@HOST]
                Optional: --ssh-port N --identity-file FILE --on-vps --ticket FILE
  claude-reset  Preview local Claude reset; --yes applies [--extra-path PATH ...]
  qr            Generate VLESS link + offline QR --config FILE --output DIR

Safety: setup and claude-reset default to dry-run. Their confirmations are
independent. Reset preserves apps, CLI and shared skills. No ticket is ever
submitted automatically. QR files contain node credentials: do not publish them.
`;

function options(args, spec) {
  return parseArgs({ args, options: spec, allowPositionals: false }).values;
}

function required(value, name) {
  if (!value) throw new Error(`Missing required option: ${name}`);
  return value;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    const pkg = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  if (command === 'guard') {
    const values = options(args, {
      'verge-dir': { type: 'string' }, watch: { type: 'boolean', default: false },
      enforce: { type: 'boolean', default: false }, yes: { type: 'boolean', default: false },
    });
    const vergeDir = values['verge-dir'] ? expandHome(values['verge-dir']) : defaultVergeDir();
    if (values.watch) {
      print({ watch: true, intervalMs: 2000, vergeDir, enforce: values.enforce && values.yes });
      watchGuard({
        vergeDir, enforce: values.enforce, yes: values.yes,
        onResult: print,
        onError: (error) => process.stderr.write(`guard: ${error.message}\n`),
      });
    } else {
      const result = guardOnce({ vergeDir, enforce: values.enforce, yes: values.yes });
      print(result);
      if (!result.ok) process.exitCode = 1;
    }
    return;
  }

  if (command === 'reference') {
    print(REFERENCE_ENVIRONMENT);
    return;
  }

  if (command === 'install' || command === 'install-skill') {
    const values = options(args, { target: { type: 'string', default: 'agents' }, force: { type: 'boolean', default: false } });
    print(installSkill(values));
    return;
  }

  if (command === 'export-profile') {
    const values = options(args, { config: { type: 'string' }, output: { type: 'string' } });
    const node = readNodeConfig(required(values.config, '--config'));
    const file = expandHome(required(values.output, '--output'));
    atomicWrite(file, YAML.stringify(buildMihomoProfile(node)));
    print({ profile: file, changedClash: false });
    return;
  }

  if (command === 'setup') {
    const values = options(args, {
      config: { type: 'string' }, 'verge-dir': { type: 'string' },
      yes: { type: 'boolean', default: false }, restart: { type: 'boolean', default: false },
      'enable-tun': { type: 'boolean', default: false }, 'qr-dir': { type: 'string' },
    });
    const node = readNodeConfig(required(values.config, '--config'));
    const result = await setupProxy({
      node,
      vergeDir: values['verge-dir'] ? expandHome(values['verge-dir']) : undefined,
      yes: values.yes,
      restart: values.restart,
      enableTun: values['enable-tun'],
    });
    print(printablePlan(result));
    if (values['qr-dir']) {
      if (!values.yes) {
        print({ qr: { output: expandHome(values['qr-dir']), generated: false, reason: 'dry-run' } });
      } else {
        const qr = await generateMobileQr(node, expandHome(values['qr-dir']));
        print({ qr });
      }
    }
    return;
  }

  if (command === 'qr') {
    const values = options(args, { config: { type: 'string' }, output: { type: 'string' } });
    const node = readNodeConfig(required(values.config, '--config'));
    const result = await generateMobileQr(node, expandHome(required(values.output, '--output')));
    print(result);
    return;
  }

  if (command === 'claude-reset') {
    const values = options(args, {
      yes: { type: 'boolean', default: false },
      'extra-path': { type: 'string', multiple: true, default: [] },
    });
    const result = await resetClaude({
      yes: values.yes,
      extraPaths: values['extra-path'].map(expandHome),
    });
    print(result);
    return;
  }

  if (command === 'probe') {
    const values = options(args, {
      url: { type: 'string' }, proxy: { type: 'string' },
      offline: { type: 'boolean', default: false },
    });
    print(await probeNetwork({ url: values.url, proxy: values.proxy, offline: values.offline }));
    return;
  }

  if (command === 'google-region') {
    const values = options(args, {
      'ssh-target': { type: 'string' }, 'ssh-port': { type: 'string' },
      'identity-file': { type: 'string' }, 'on-vps': { type: 'boolean', default: false },
      ticket: { type: 'string' },
    });
    const report = await detectGoogleRegion({
      sshTarget: values['ssh-target'], sshPort: values['ssh-port'],
      identityFile: values['identity-file'] ? expandHome(values['identity-file']) : undefined,
      onVps: values['on-vps'],
    });
    print(report);
    if (values.ticket) {
      const file = expandHome(values.ticket);
      atomicWrite(file, buildLisaTicket(report));
      print({ ticket: file, submitted: false });
    }
    return;
  }
  throw new Error(`Unknown command: ${command}. Run --help.`);
}

main().catch((error) => {
  process.stderr.write(`network-proxy-guard: ${error.message}\n`);
  process.exitCode = 1;
});
