# Offline mobile QR delivery

Use the same `node.json` used for Clash setup. The CLI builds a VLESS Reality URI and renders it locally as `shadowrocket-qr.png`; it also writes `vless-link.txt`. No online QR service is used. Reality X25519 public keys must be exactly 43 base64url characters. `flow` is included only when explicitly present in the node config; do not blindly add Vision to every VLESS node.

```bash
network-proxy-guard qr --config /private/path/node.json --output /private/path/mobile-qr
# Or as part of an approved setup:
network-proxy-guard setup --config /private/path/node.json --yes --qr-dir /private/path/mobile-qr
```

The QR payload is the complete VLESS URI. Both files are sensitive credentials and are created with owner-only permissions. Report file paths, not the URI, and never commit or upload them.

Shadowrocket versions with VLESS Reality support can scan the QR. Other mobile apps may require a different URI or import format; do not promise universal compatibility. After import, use rule mode where appropriate and verify the egress matches the computer. Regenerate both desktop and mobile artifacts after an IP, port, UUID or Reality parameter change.
