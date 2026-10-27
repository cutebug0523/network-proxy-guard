# Configuration guard / sentinel

Use the guard when an agent or another tool may change Clash Verge away from the reference invariants. It inspects real files instead of trusting an agent's summary.

## Audit

`network-proxy-guard guard` is read-only and exits nonzero on violations. It checks `mode: rule`, `ipv6: false`, PAC disabled, a loadable current profile, domestic `GEOSITE/GEOIP CN DIRECT` rules, no `MATCH,DIRECT`, and no automatic `fallback/url-test` group containing DIRECT.

`network-proxy-guard guard --watch` repeats the audit every two seconds in the foreground and prints only changes. It is not a hidden daemon; stop it with Ctrl+C when you intentionally want another configuration.

## Repair

`network-proxy-guard guard --enforce --yes` backs up and repairs only `mode`, `ipv6`, and `proxy_auto_config`. `--enforce` without `--yes` remains a dry-run. `--watch --enforce --yes` applies the same limited repair when drift appears and must be explicitly approved for that session.

The guard deliberately does not rewrite a profile, subscription, selected node, or proxy group. Domestic-rule or DIRECT-fallback violations require a fresh `setup` dry-run and user review instead of an unattended edit.
