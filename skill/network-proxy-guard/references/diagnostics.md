# Layered diagnostics

## Prevent contaminated measurements

Label every result as local direct, local explicit proxy, VPS direct, or external probe. Existing system proxy/TUN can affect curl, nc, SSH, ping, DNS and speed tests. Use explicit direct/proxy controls and repeat failures.

`network-proxy-guard probe --url https://www.google.com/generate_204` performs a direct HTTP probe without reading page content. Add `--proxy http://127.0.0.1:PORT` for an explicit comparison, or `--offline` for local proxy settings only.

## Decision tree

1. **Service:** correct process, one intended listener, valid client/server configuration.
2. **Host:** local firewall, DNS, route, system proxy, TUN/helper state.
3. **Provider:** security group attached and active, upstream port policy, instance status and announcements.
4. **Path:** compare domestic and other international targets, local and external perspectives, peak/off-peak and repeated requests.
5. **Destination:** CDN behavior, service-specific region database, account restrictions, or third-party blocks.

A refused connection usually reached a host that has no listener; a timeout can be filtering or loss. Ping failure alone does not prove a dead VPS. Low latency to an anycast service is not proof of physical location.

## Routing and fail-open checks

- Put explicit sensitive domain rules before GeoIP/MATCH. CDN IP classification can cause DIRECT leaks or resolution-time failures.
- Cover actual OAuth/API/WebSocket/JS SDK domains, not only product homepages. Stripe.js is a required payment-page resource.
- Use the node-server DIRECT rule to avoid TUN hairpin tests, while keeping sensitive service groups free of DIRECT fallback.
- `select` does not automatically fail over. `fallback`/`url-test` containing DIRECT, PAC with `DIRECT;`, and browser-specific proxy failover need separate review.
- A failed proxied request usually means the destination saw nothing; a successful unintended DIRECT request is the privacy/account-location risk. Never turn this into a guarantee about provider logging or account enforcement.

## TUN and WebRTC

HTTP/SOCKS system proxy does not inherently cover WebRTC UDP. `tun: true` alone is insufficient evidence: verify helper/core compatibility, IPC, routes, fake-ip/DNS, UDP and a public-IP leak test. WebRTC exposure is relevant to privacy, calls and region checks; ordinary HTTPS API traffic is a separate question.

For slow service, do not immediately reinstall or switch nodes. Compare server health, external reachability and alternative targets. Record timestamps and avoid confident conclusions from a single speed test.
