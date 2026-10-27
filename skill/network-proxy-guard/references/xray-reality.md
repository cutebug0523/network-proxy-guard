# Xray VLESS Reality server runbook

Use this runbook only when the user explicitly asks to create or change a server. It is not part of client-side setup by default.

## Before changing anything

- Confirm the VPS provider, OS, SSH access, intended domain/port, and whether a snapshot/backup exists.
- Show the planned packages, services, ports, firewall/security-group changes, and restart window. Get separate VPS approval.
- Preserve password login until key login has been tested in a second independent session. Do not lock the user out.
- Use official Xray releases or another user-approved source; prefer pinned versions and integrity checks over piping an unknown script to a root shell.

## Port diagnosis

Check in order: Xray process/listener, host firewall, provider security group and instance association, provider upstream restrictions, local-to-VPS reachability, and external probes. `timeout` differs from `connection refused`. One `nc`, ping, or proxy-contaminated curl is not enough.

Reality does not require TCP 443. Do not claim that 443 is inherently unblockable. Choose a reachable port based on evidence and keep only required ports exposed.

## Reality parameters

- Generate UUID/key material on the server and never expose the Reality private key in client files, logs, tickets, GitHub, or QR output.
- Keep server `dest`/`serverNames` consistent with client SNI and public key/short ID.
- Test candidate `dest` sites from the VPS repeatedly. A result for Apple, Microsoft, or any other domain on one machine is not a universal recommendation.
- For intermittent handshakes, check duplicate Xray processes/SO_REUSEPORT, old test listeners, mismatched client/server configuration, and both debug logs before reinstalling.

## Performance and acceptance

BBR, `fq`, and buffer changes are optional experiments, not guaranteed optimizations. Record the previous sysctl values and compare repeated measurements before keeping them.

Validate with a server-side loopback client and then a real external client. Check repeated TLS/HTTP success, egress IP, domestic DIRECT behavior, and speed. Remove temporary listeners/configs only after identifying them; do not use broad process kills. Leave a sanitized backup and maintenance commands.

A provider IP replacement may also change the host, SSH keys, security groups, and open ports. Revalidate all of them before updating client profiles or mobile QR codes.
