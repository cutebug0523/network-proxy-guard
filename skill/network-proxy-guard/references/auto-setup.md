# Automatic Clash Verge setup

## Scope

The CLI imports and activates a local mihomo profile, sets rule mode, disables PAC, enables the system proxy when `verge.yaml` exists, and preserves TUN unless `--enable-tun` is explicitly requested. It does not install Xray, upgrade Clash Verge, install privileged services, or change SSH settings.

## Flow

1. Copy `assets/node.example.json` to a private working location and fill it with the user's node data. Never commit or upload the filled file.
2. Run `setup --config ...` without `--yes`. Check the detected Verge directory, mixed port, existing profile count, TUN state, validation availability, and whether the app needs restarting.
3. Present the plan. Get approval for configuration and, separately, for `--restart` or `--enable-tun` when needed.
4. Re-run with `--yes`. Add `--qr-dir` only if mobile output was also approved.
5. Verify after Clash Verge restarts. A generated file is not proof that traffic uses the node.

The default Verge path is the standard Clash Verge Rev macOS application-support path. Use `--verge-dir` for a different installation; do not guess from another user's machine.

## Safety properties

- Existing profile entries are retained; only an entry previously managed with the same generated UID is replaced.
- The current profile is activated only on apply. Backups are stored under `~/.network-proxy-guard/backups/` with a manifest.
- The local mixed port is read, not hardcoded. The node server port is a separate value from `node.json`.
- PAC is disabled because a PAC script ending in `DIRECT` can fail open. Do not enable it for sensitive accounts without an explicit fail-closed review.
- If the app is running, apply stops unless `--restart` was approved. Never kill the app with a broad process match.
- If validation fails before changes, the original configuration remains active. Filesystem errors during writes trigger rollback.
- YAML-only validation must be reported as such. Do not say mihomo accepted the profile when no core was available.

## TUN

`--enable-tun` only changes the Verge preference. It does not install or repair the privileged helper. Before using it, verify the helper/core versions, IPC, administrator authorization, routes, DNS and UDP. Afterward test WebRTC and the direct management route to the node server. Enabling TUN affects all apps and may increase latency for domestic video calls.

## CLI and application coverage

Do not assume shell tools follow macOS system proxy. Inspect `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, and the real destination. Do not remove generic proxy variables during Claude cleanup. Identify the actual gateway: a Claude model inside a third-party client may not use the same endpoint as Claude web or Claude Code.
