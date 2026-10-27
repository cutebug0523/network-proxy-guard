import path from 'node:path';
import QRCode from 'qrcode';
import { buildVlessUri } from './node-config.js';
import { atomicWrite, ensurePrivateDir, exists } from './utils.js';

export async function generateMobileQr(node, outputDir) {
  const uri = buildVlessUri(node);
  const directory = path.resolve(outputDir);
  if (!exists(directory)) ensurePrivateDir(directory);
  const linkFile = path.join(directory, 'vless-link.txt');
  const qrFile = path.join(directory, 'shadowrocket-qr.png');
  const png = await QRCode.toBuffer(uri, {
    errorCorrectionLevel: 'M',
    margin: 3,
    width: 512,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  atomicWrite(linkFile, `${uri}\n`);
  atomicWrite(qrFile, png);
  return { linkFile, qrFile };
}
