# Claude local reset

This is an independent, destructive module. Never run it because the user asked for proxy setup.

## Scope and consent

Run `network-proxy-guard claude-reset` first and show the dry-run. Explain each found path, shell edits, launchd variables, backup location, and preserved items. Use `--yes` only after separate explicit approval.

The reset covers common Claude Code/Desktop and CC Switch traces under the home directory, Claude-specific shell environment entries, and common launchd `ANTHROPIC_*`/`CLAUDE_*` variables. Use repeated `--extra-path` only for user-reviewed additional paths inside HOME.

It deliberately preserves:

- Claude Code CLI and desktop applications; uninstall is not part of reset
- project code and documents
- `~/.claude/skills`, `~/.agents`, `~/.codex`, and shared skill links
- generic proxy variables such as `HTTP_PROXY` and `HTTPS_PROXY`

Do not broaden deletion to every filename containing Claude across the whole filesystem. A symlinked `~/.claude` is rejected rather than traversed; symlinked shell files and unusual Keychain/application items require manual review rather than automated guessing.

## Backup and verification

Apply moves found data into `~/.network-proxy-guard/backups/claude-reset-*`; it does not securely erase it. Tell the user that the backup still contains sensitive data and can be deleted after verification. Shell files are edited only after backup, and filesystem failures trigger rollback. Launchd cleanup is best-effort after the file transaction; any failed variable is reported separately rather than falsely claiming a complete rollback.

Open a new shell and verify that Claude-specific environment entries are gone, generic proxy settings remain, shared skills still work, and preserved programs are still installed. Local cleanup does not sign out every web session or revoke provider tokens. Revoke unused API/transit tokens at the provider separately.
