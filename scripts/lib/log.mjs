// stderr ロガー。予約番号・PDFフルパスはここでマスクする。
import { basename } from 'node:path';

export function maskReservation(n) {
  if (!n || n.length < 5) return '****';
  return `${n.slice(0, 2)}${'*'.repeat(n.length - 4)}${n.slice(-2)}`;
}

export const maskPath = (p) => basename(String(p));

export function createLogger({ quiet = false, verboseSecrets = false } = {}) {
  const out = (lvl, msg) => {
    if (quiet && lvl !== 'ERROR') return;
    process.stderr.write(`[seven-netprint] ${lvl}: ${msg}\n`);
  };
  return {
    verboseSecrets,
    info: (m) => out('INFO', m),
    warn: (m) => out('WARN', m),
    error: (m) => out('ERROR', m),
    mask: (n) => (verboseSecrets ? n : maskReservation(n)),
    path: (p) => (verboseSecrets ? String(p) : maskPath(p)),
  };
}
