# Google IP region mismatch and Lisa ticket

A `google.com.hk` redirect means a Google region signal, not that the server is physically in Hong Kong or traffic is routed there. Gemini availability also depends on account region and is not a standalone IP test.

## Evidence workflow

1. Confirm which egress the local test uses.
2. Run the Google test from the VPS itself without a client proxy. Use either SSH from the local machine or run the command on the VPS with `--on-vps`.
3. Compare several independent geolocation databases and record time, the same public IPv4 and response `Location` header. Force IPv4 for this check; WHOIS/ASN and YouTube region can be supporting evidence, not proof by themselves.

```bash
# Local evidence only; not enough for a provider ticket
network-proxy-guard google-region

# VPS-direct evidence through existing SSH key access
network-proxy-guard google-region --ssh-target user@host --ssh-port 22

# Generate, but never submit, a Lisa ticket draft when evidence qualifies
network-proxy-guard google-region --ssh-target user@host --ticket /private/path/lisa-ticket.md
```

SSH uses batch mode and never asks the agent for a password. The command performs HTTPS requests only; it does not change VPS configuration.

## Classification

- VPS-direct Google HK redirect + at least two geolocation databases reporting US for the same valid IPv4: `google-region-mismatch`; a ticket is justified.
- Local-only HK result: `needs-vps-direct-test`; inspect local egress/account state and do not blame the provider yet.
- HK result without supporting US databases: provider/geo-data evidence is mixed; ask for verification rather than asserting a Google-only problem.
- No HK redirect: report the observed result, not a blanket guarantee that every Google product recognizes the US.

## Ticket and IP-change safeguards

Use `assets/lisa-google-region-ticket.md` or the generated draft. Ask the provider to investigate historical region labeling and, if needed, provide an IP that Google recognizes as US. Do not submit automatically.

Explicitly ask whether the operation is an IP-only change or a host migration. Request no reinstall/reset/migration without confirmation, and clarify data, rental time and traffic preservation. After a change, verify data, Xray, SSH keys, security groups, ports and BBR before modifying client profiles or regenerating QR codes.
