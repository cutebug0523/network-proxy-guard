---
name: network-proxy-guard
description: Consent-first macOS proxy setup and diagnosis for Clash Verge Rev/mihomo, Xray VLESS Reality, TUN/WebRTC, AI/payment routing, Google IP region mismatch and Lisa tickets, local Claude/CC Switch reset, and offline Shadowrocket VLESS QR generation. Use this skill whenever the user asks to configure or repair proxy networking, check whether Claude/OpenAI/Stripe leaks to DIRECT, test why Google treats a US VPS IP as Hong Kong, reset Claude configuration, or generate a mobile proxy QR code—even if they do not name this skill.
compatibility: macOS; Node.js 18+; Clash Verge Rev/mihomo for automatic client setup; SSH for remote VPS-direct checks
---

# Network Proxy Guard

Configure and diagnose a working proxy without silently changing the user's machine. The npm installer copies files only. Reading this skill never authorizes setup, cleanup, restarts, SSH changes, ticket submission, or package installation.

## Safety contract

1. Start with read-only inspection or a dry-run. Never pass `--yes` on the first inspection.
2. Show the proposed files, commands, restarts, privileges, backups, and possible network interruption. Ask the user to confirm the actual plan.
3. Use `--yes` only after explicit approval. Approval for proxy setup does not approve Claude cleanup, TUN service changes, VPS changes, uninstalls, or provider tickets.
4. Keep existing profiles and create backups. Do not use broad `rm -rf`, fuzzy home-directory deletion, online QR generators, or real credentials in documentation and logs.
5. Treat node links, QR images, UUIDs, subscription URLs, private keys, and tokens as sensitive. Public keys are not private keys, but a complete node configuration is still a credential set.
6. Do not claim that a dedicated IP, port 443, a fixed node, or any provider guarantees account safety or prevents blocking.

## Choose the relevant runbook

- New Xray/VLESS Reality server or port/protocol problems: read `references/xray-reality.md`.
- Import/activate a Clash Verge profile or configure system proxy: read `references/auto-setup.md`.
- Connectivity, slow routes, DNS, GeoIP, DIRECT fallback, TUN or WebRTC: read `references/diagnostics.md`.
- Google treats a US IP as Hong Kong or a Lisa IP-change ticket is needed: read `references/google-ip-region.md`.
- Claude Code/Desktop/CC Switch cleanup: read `references/claude-reset.md` and get separate approval.
- Shadowrocket/mobile QR: read `references/mobile-qr.md`.

Read only the runbooks required for the request. Do not run every module by default.

## Command policy

Prefer `network-proxy-guard` when it is on PATH. Otherwise use `npx --yes network-proxy-guard@latest` with the same arguments; tell the user that npx will download the package before doing so.

```bash
# Preview and then apply only after approval
network-proxy-guard setup --config /path/to/node.json
network-proxy-guard setup --config /path/to/node.json --yes

# YAML-only alternative for official UI import
network-proxy-guard export-profile --config /path/to/node.json --output /private/path/profile.yaml

# Independent optional actions
network-proxy-guard claude-reset
network-proxy-guard claude-reset --yes
network-proxy-guard qr --config /path/to/node.json --output /private/output/path
network-proxy-guard google-region --ssh-target user@host --ticket /path/to/lisa-ticket.md
```

`setup` and `claude-reset` have separate confirmations. `google-region` only creates a ticket draft; never submit it automatically. QR generation requires an output action but does not change proxy configuration.

## Required verification

- Validate generated mihomo configuration before activation when a core is available; distinguish YAML-only validation from a real mihomo test.
- After setup, verify foreign egress, domestic DIRECT routing, sensitive domain rules, and restart persistence. Inspect actual mihomo connections rather than inferring behavior from the app name.
- Distinguish direct, explicit-proxy, VPS-direct, and third-party probe results. A test contaminated by an existing proxy is not evidence.
- For Claude reset, report preserved apps/shared skills, backup location, and the need to open a new shell. Local deletion does not revoke tokens.
- For QR output, report paths only, not the VLESS URI. Ask the user to scan and verify the same egress.

## Response format

Return concise sections: **requested action**, **evidence/plan**, **changes and backup**, **verification**, and **remaining risks**. Clearly separate completed actions from instructions the user still needs to perform.
