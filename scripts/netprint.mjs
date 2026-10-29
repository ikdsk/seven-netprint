#!/usr/bin/env node
// seven-netprint CLI エントリ。詳細は README.md / SKILL.md
import { parseCli, HELP, errorPayload, exitCodeFor, writeOutputFile } from './lib/cli.mjs';
import { createLogger } from './lib/log.mjs';
import { runNetprint } from './lib/flow.mjs';
import { EXIT } from './lib/errors.mjs';

async function main() {
  let cli;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`[seven-netprint] ERROR: ${e.message}\n`);
    process.stdout.write(JSON.stringify(errorPayload(e)) + '\n');
    return exitCodeFor(e);
  }
  if (cli.help) {
    process.stdout.write(HELP);
    return EXIT.OK;
  }
  const o = cli.opts;
  const log = createLogger({ quiet: o.quiet, verboseSecrets: o.verboseSecrets });
  for (const w of o.file.warnings) log.warn(w);
  try {
    const r = await runNetprint(o, log);
    log.info(`登録完了: 予約番号 ${log.mask(r.reservationNumber)} / 有効期限 ${r.expiresAt}${r.pages ? ` / ${r.pages}枚` : ''}`);
    if (o.output) writeOutputFile(o.output, r);
    process.stdout.write(JSON.stringify(r) + '\n');
    return EXIT.OK;
  } catch (e) {
    const payload = errorPayload(e);
    // --quiet/--json でもエラー本文は stderr に出す
    process.stderr.write(`[seven-netprint] ERROR: ${payload.code}: ${payload.message}\n`);
    if (o.output) writeOutputFile(o.output, payload);
    process.stdout.write(JSON.stringify(payload) + '\n');
    return exitCodeFor(e);
  }
}

process.exitCode = await main();
