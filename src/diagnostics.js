import dns from 'node:dns';
import net from 'node:net';
import { URL } from 'node:url';
import { displayUrl, publicEnv, run } from './utils.js';

const GEO_SERVICES = [
  { name: 'ipinfo', url: 'https://ipinfo.io/json' },
  { name: 'ipwhois', url: 'https://ipwho.is/' },
  { name: 'country.is', url: 'https://api.country.is/' },
];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function sshParts(options = {}) {
  if (!options.sshTarget) return null;
  if (options.sshTarget.startsWith('-')) throw new Error('Invalid SSH target');
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];
  if (options.sshPort) args.push('-p', String(options.sshPort));
  if (options.identityFile) args.push('-i', options.identityFile);
  args.push(options.sshTarget);
  return args;
}

async function curl(url, options = {}) {
  const args = ['--ipv4', '--noproxy', '*', '-sS', '--connect-timeout', '8', '--max-time', '25'];
  if (options.headers) args.push('-D', '-', '-o', '/dev/null');
  args.push(url);
  const ssh = sshParts(options);
  if (ssh) return run('ssh', [...ssh, `curl ${args.map(shellQuote).join(' ')}`], { timeout: 35_000 });
  return run('curl', args, { timeout: 30_000 });
}

function headerValue(headers, name) {
  const matches = [...headers.matchAll(new RegExp(`^${name}:\\s*(.+)$`, 'gim'))];
  return matches.length ? matches.at(-1)[1].trim() : null;
}

function normalizeGeo(name, data) {
  if (name === 'ipinfo') return { service: name, ip: data.ip, country: data.country, city: data.city, org: data.org };
  if (name === 'ipwhois') return { service: name, ip: data.ip, country: data.country_code, city: data.city, org: data.connection?.asn_org };
  return { service: name, ip: data.ip, country: data.country };
}

export function classifyGoogleRegion({ location, geo, serverDirect }) {
  const evidenceIp = sharedUsIpv4(geo);
  const hk = /google\.com\.hk(?:[/:]|$)/i.test(location ?? '');
  if (hk && !serverDirect) return 'needs-vps-direct-test';
  if (hk && evidenceIp) return 'google-region-mismatch';
  if (hk) return 'provider-or-geo-data-mismatch';
  if (location) return 'google-other-region-redirect';
  return 'no-google-hk-redirect';
}

function sharedUsIpv4(geo) {
  const counts = new Map();
  for (const entry of geo) {
    if (entry.country?.toUpperCase() === 'US' && net.isIP(entry.ip) === 4) {
      counts.set(entry.ip, (counts.get(entry.ip) ?? 0) + 1);
    }
  }
  return [...counts].find(([, count]) => count >= 2)?.[0] ?? null;
}

export async function detectGoogleRegion(options = {}) {
  const serverDirect = Boolean(options.sshTarget || options.onVps);
  const google = await curl('https://www.google.com/', { ...options, headers: true });
  if (!google.ok) throw new Error(`Google test failed: ${google.stderr || 'network error'}`);
  const location = headerValue(google.stdout, 'location');
  const geo = await Promise.all(GEO_SERVICES.map(async ({ name, url }) => {
    const result = await curl(url, options);
    if (!result.ok) return { service: name, error: 'query failed' };
    try {
      return normalizeGeo(name, JSON.parse(result.stdout));
    } catch {
      return { service: name, error: 'invalid response' };
    }
  }));
  const evidenceIp = sharedUsIpv4(geo);
  return {
    testedAt: new Date().toISOString(),
    perspective: options.sshTarget ? 'VPS direct over SSH' : options.onVps ? 'VPS local direct' : 'local direct only',
    serverDirect,
    evidenceIp,
    google: { url: 'https://www.google.com/', location },
    geo,
    classification: classifyGoogleRegion({ location, geo, serverDirect }),
  };
}

function clean(value) {
  return String(value ?? 'unknown').replace(/[|\r\n]/g, '/');
}

export function buildLisaTicket(report) {
  if (report.classification !== 'google-region-mismatch') {
    throw new Error(`Evidence does not justify this ticket yet: ${report.classification}`);
  }
  if (!report.serverDirect) throw new Error('A VPS-direct test is required before creating the ticket');
  const ip = report.evidenceIp;
  if (!ip || net.isIP(ip) !== 4) throw new Error('Two geolocation providers must agree on the same US IPv4');
  const evidence = report.geo.filter((entry) => entry.ip === ip);
  if (evidence.length < 2 || evidence.some((entry) => entry.country?.toUpperCase() !== 'US')) {
    throw new Error('Ticket evidence is inconsistent');
  }
  const rows = evidence.map((entry) => `| ${clean(entry.service)} | ${clean(entry.country)} | ${clean(entry.city)} |`).join('\n');
  return `主题：美国洛杉矶 VPS 的 IPv4 被 Google 判定为香港，申请核查并更换正确识别为美国的 IP\n\n你好，\n\n我购买的是美国洛杉矶地区的 VPS，当前实例公网 IPv4 为：${clean(ip)}。\n\n我在 VPS 本机直接访问 Google，未经过本地代理、VPN、浏览器 Cookie 或 Google 账号，访问 https://www.google.com/ 时跳转至：${clean(report.google.location)}。\n\n测试视角：${clean(report.perspective)}\n测试时间：${clean(report.testedAt)}\n\n第三方地理库结果：\n\n| 服务 | 国家/地区 | 城市 |\n|---|---|---|\n${rows}\n\n由于测试是在 VPS 本机直接完成，可以排除本地电脑代理规则、浏览器 Cookie 和本地 DNS 的影响。目前看起来是 Google 对该 IP 的地区识别与实例所在地区不一致，可能影响依赖 Google 地区判定的服务。\n\n请协助：\n1. 核查该 IP 是否存在历史地区标记或地区广播异常；\n2. 如无法修正，请更换一个能够被 Google 正确识别为美国的 IPv4；\n3. 操作前请说明是仅更换 IP，还是需要迁移实例/宿主机；\n4. 请勿直接重装、重置或迁移实例。如涉及这些操作，请先与我确认；\n5. 请确认更换后原实例数据、剩余使用时长及流量额度是否保留。\n\n我可以提供完整的响应头和地理库查询结果。谢谢。\n`;
}

async function curlMetrics(url, proxy) {
  const args = ['-sS', '--connect-timeout', '8', '--max-time', '20', '-o', '/dev/null'];
  if (proxy) args.push('-x', proxy);
  else args.push('--noproxy', '*');
  args.push('-w', '%{http_code}\\n%{remote_ip}\\n%{time_total}', url);
  const result = await run('curl', args, { timeout: 25_000 });
  const [httpCode, remoteIp, seconds] = result.stdout.trim().split('\n');
  const connectionError = result.ok ? undefined : [url, proxy].filter(Boolean).reduce(
    (message, sensitive) => message.split(sensitive).join(displayUrl(sensitive)),
    result.stderr,
  );
  return { ok: result.ok, httpCode, remoteIp, seconds, error: connectionError };
}

async function systemProxy() {
  if (process.platform !== 'darwin') return null;
  const result = await run('scutil', ['--proxy'], { timeout: 3000 });
  if (!result.ok) return null;
  const output = {};
  for (const name of ['HTTPEnable', 'HTTPProxy', 'HTTPPort', 'HTTPSEnable', 'HTTPSProxy', 'HTTPSPort', 'SOCKSEnable', 'SOCKSProxy', 'SOCKSPort', 'ProxyAutoConfigEnable']) {
    const match = result.stdout.match(new RegExp(`${name}\\s*:\\s*([^\\n]+)`));
    if (match) output[name] = match[1].trim();
  }
  return output;
}

export async function probeNetwork(options = {}) {
  const target = new URL(options.url ?? 'https://www.google.com/generate_204');
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Only HTTP(S) probe URLs are supported');
  const result = {
    platform: process.platform,
    arch: process.arch,
    proxyEnv: publicEnv(),
    systemProxy: await systemProxy(),
    url: displayUrl(target.toString()),
    proxy: displayUrl(options.proxy),
  };
  if (!options.offline) {
    try {
      result.dns = await dns.promises.lookup(target.hostname, { all: true });
    } catch (error) {
      result.dns = { error: error.message };
    }
    result.connection = await curlMetrics(target.toString(), options.proxy);
  }
  return result;
}
