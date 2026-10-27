import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resetClaude } from '../src/claude-reset.js';

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-reset-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const files = {
    '.claude/settings.json': '{"token":"do-not-print-this"}\n',
    '.claude/projects/history.jsonl': 'history\n',
    '.claude/skills/shared/SKILL.md': 'keep me\n',
    '.claude.json': '{"oauth":true}\n',
    '.cc-switch/db.sqlite': 'database',
    'Library/Application Support/Claude/state.json': '{}',
    'Library/Application Support/CC Switch/config.json': '{}',
    'Library/Application Support/Unrelated/keep.txt': 'keep',
    'bin/claude': 'fake CLI preserved',
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(home, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  fs.writeFileSync(path.join(home, '.zshrc'), 'export ANTHROPIC_BASE_URL=https://example.invalid\nexport HTTP_PROXY=http://127.0.0.1:7897\n');
  return home;
}

const runtime = {
  listLaunchEnv: async () => ['ANTHROPIC_BASE_URL'],
};

test('Claude reset rejects shared or over-broad paths without changing them', async (t) => {
  const home = fixture(t);
  await assert.rejects(resetClaude({
    home, extraPaths: [path.join(home, 'Library')], runtime,
  }), /Extra path must be a specifically named/);
  assert.ok(fs.existsSync(path.join(home, '.claude/settings.json')));

  const alias = path.join(home, 'alias-claude');
  fs.symlinkSync(path.join(home, '.claude', 'skills'), alias, 'dir');
  await assert.rejects(resetClaude({ home, extraPaths: [alias], runtime }), /protected or shared path/);
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'shared', 'SKILL.md')));

  const linkedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-reset-link-'));
  t.after(() => fs.rmSync(linkedHome, { recursive: true, force: true }));
  fs.mkdirSync(path.join(linkedHome, 'real-claude'));
  fs.writeFileSync(path.join(linkedHome, 'real-claude', 'settings.json'), '{}');
  fs.symlinkSync(path.join(linkedHome, 'real-claude'), path.join(linkedHome, '.claude'), 'dir');
  await assert.rejects(resetClaude({ home: linkedHome, runtime }), /symlinked ~\/\.claude/);
  assert.ok(fs.existsSync(path.join(linkedHome, 'real-claude', 'settings.json')));
});

test('Claude reset dry-run is inert and apply preserves programs, skills and generic proxy', async (t) => {
  const home = fixture(t);
  const dry = await resetClaude({ home, runtime });
  assert.equal(dry.plan.mode, 'dry-run');
  assert.equal(dry.plan.shellEdits.find((edit) => edit.file === '.zshrc').removedLines, 1);
  assert.ok(!JSON.stringify(dry).includes('do-not-print-this'));
  assert.ok(fs.existsSync(path.join(home, '.claude/settings.json')));

  const unset = [];
  const result = await resetClaude({
    home, yes: true,
    runtime: { ...runtime, unsetLaunchEnv: async (name) => unset.push(name) },
  });
  assert.equal(result.plan.mode, 'applied');
  assert.ok(!fs.existsSync(path.join(home, '.claude/settings.json')));
  assert.ok(fs.existsSync(path.join(home, '.claude/skills/shared/SKILL.md')));
  assert.ok(fs.existsSync(path.join(home, 'bin/claude')));
  assert.ok(fs.existsSync(path.join(home, 'Library/Application Support/Unrelated/keep.txt')));
  assert.ok(!fs.existsSync(path.join(home, '.cc-switch')));
  assert.deepEqual(unset, ['ANTHROPIC_BASE_URL']);
  const shell = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.ok(!shell.includes('ANTHROPIC'));
  assert.ok(shell.includes('HTTP_PROXY'));
  const backup = result.backup.replace(/^~/, home);
  assert.ok(fs.existsSync(path.join(backup, 'files', '.claude', 'settings.json')));
  assert.ok(fs.existsSync(path.join(backup, 'manifest.json')));
});

test('a specifically named extra path inside HOME remains usable', async (t) => {
  const home = fixture(t);
  const extra = path.join(home, '.config', 'anthropic');
  fs.mkdirSync(extra, { recursive: true });
  fs.writeFileSync(path.join(extra, 'config.json'), '{}');
  const dry = await resetClaude({ home, extraPaths: [extra], runtime });
  assert.ok(dry.plan.targets.includes('~/.config/anthropic'));
  const result = await resetClaude({
    home, yes: true, extraPaths: [extra],
    runtime: { ...runtime, unsetLaunchEnv: async () => {} },
  });
  assert.equal(result.plan.mode, 'applied');
  assert.ok(!fs.existsSync(extra));
});

test('uppercase Skills is preserved on case-insensitive filesystems', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'npg-reset-case-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.claude', 'Skills'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'Skills', 'keep.md'), 'keep');
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}');
  const dry = await resetClaude({ home, runtime });
  assert.ok(!dry.plan.targets.some((target) => target.toLowerCase().includes('/skills')));
  const result = await resetClaude({
    home, yes: true,
    runtime: { ...runtime, unsetLaunchEnv: async () => {} },
  });
  assert.equal(result.plan.mode, 'applied');
  assert.ok(fs.existsSync(path.join(home, '.claude', 'Skills', 'keep.md')));
});

test('launchd failure is explicit and does not trigger a misleading file rollback', async (t) => {
  const home = fixture(t);
  const result = await resetClaude({
    home, yes: true,
    runtime: {
      ...runtime,
      unsetLaunchEnv: async () => { throw new Error('fixture unset failed'); },
    },
  });
  assert.deepEqual(result.plan.launchEnvFailed, ['ANTHROPIC_BASE_URL']);
  assert.ok(result.plan.warnings.some((warning) => warning.includes('Could not clear launchd')));
  assert.ok(!fs.existsSync(path.join(home, '.claude', 'settings.json')));
  const backup = result.backup.replace(/^~/, home);
  const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.launchEnvFailed, ['ANTHROPIC_BASE_URL']);
});
