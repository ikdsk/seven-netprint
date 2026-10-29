#!/usr/bin/env node
// 依存なしで1ページのダミーPDFを生成する。 usage: node scripts/make-test-pdf.mjs [out.pdf] [text]
import { writeFileSync } from 'node:fs';

export function buildPdf(text = 'seven-netprint E2E test') {
  const esc = text.replace(/[\\()]/g, '\\$&');
  const stream = `BT /F1 24 Tf 72 700 Td (${esc}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] || 'artifacts/e2e-test.pdf';
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buildPdf(process.argv[3] || undefined));
  console.error(`wrote ${out}`);
}
