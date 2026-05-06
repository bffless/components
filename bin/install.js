#!/usr/bin/env node

/**
 * bffless-install — copy a BFFless install pack's schemas + proxy rules into a
 * consumer template's .bffless/ directory so the existing provision-site action
 * picks them up at deploy time.
 *
 *   $ bffless-install <slug> [--config-path .bffless]
 *   $ bffless-install scheduling
 *
 * Idempotent: existing schemas (by name) and rule sets (by name) are skipped.
 * Run again after the pack updates and you'll get the new entries appended;
 * existing ones aren't touched (use --force to overwrite — see below).
 *
 * The mutation is intended for CI deploy time only. provision-site runs in a
 * fresh checkout, so the merged content lives in a throwaway working tree.
 * Local dev shouldn't need to run this; if you do, `git diff` will flag the
 * change and you can revert before committing.
 */

const fs = require('node:fs');
const path = require('node:path');

const PACK_ROOT = path.resolve(__dirname, '..', 'bffless');

function parseArgs(argv) {
  const args = { slug: null, configPath: '.bffless', force: false };
  let positional = 0;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config-path') {
      args.configPath = argv[++i];
    } else if (arg.startsWith('--config-path=')) {
      args.configPath = arg.slice('--config-path='.length);
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0);
    } else if (!arg.startsWith('-')) {
      if (positional === 0) args.slug = arg;
      positional++;
    } else {
      console.error(`Unknown flag: ${arg}`);
      printHelpAndExit(1);
    }
  }
  if (!args.slug) {
    console.error('Missing required positional <slug>.');
    printHelpAndExit(1);
  }
  return args;
}

function printHelpAndExit(code) {
  console.log(`
Usage: bffless-install <slug> [--config-path <dir>] [--force]

Copies a BFFless install pack's schemas + proxy rules into a consumer
template's .bffless/ directory so the existing provision-site GitHub Action
picks them up at deploy time.

Arguments:
  <slug>           Install pack to apply (e.g. "scheduling"). Must exist at
                   @bffless/components/bffless/<slug>/.

Flags:
  --config-path    Target .bffless/ directory. Default: .bffless
  --force          Overwrite existing schemas / rule sets with matching names.
                   Off by default — runs are idempotent without it.
  -h, --help       Show this help.
`);
  process.exit(code);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  // 2-space indent, trailing newline — matches the existing template files so
  // diffs against committed sources stay minimal.
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function loadPack(slug) {
  const dir = path.join(PACK_ROOT, slug);
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Install pack not found: ${dir}\n` +
        `Expected the pack to ship under @bffless/components/bffless/${slug}/. ` +
        `Run "ls node_modules/@bffless/components/bffless" to see what's available.`,
    );
  }
  const schemasFile = path.join(dir, 'schemas.json');
  const pipelinesFile = path.join(dir, 'pipelines.json');
  const schemas = readJson(schemasFile);
  const pipelinesRaw = readJson(pipelinesFile);
  if (!Array.isArray(schemas)) {
    throw new Error(`Pack ${slug}: ${schemasFile} must be a JSON array of schema definitions.`);
  }
  // Two accepted shapes:
  //   1. Single rule set: `{ name, description, rules: [...] }` — the canonical
  //      pack shape (one pack = one rule set, per the README convention).
  //   2. Multi rule set: `{ ruleSets: [...] }` — same shape as the consumer's
  //      proxy-rules.json. Reserved for future packs that genuinely need more
  //      than one rule set.
  let ruleSets;
  if (pipelinesRaw && typeof pipelinesRaw === 'object' && Array.isArray(pipelinesRaw.ruleSets)) {
    ruleSets = pipelinesRaw.ruleSets;
  } else if (pipelinesRaw && typeof pipelinesRaw === 'object' && Array.isArray(pipelinesRaw.rules)) {
    ruleSets = [pipelinesRaw];
  } else {
    throw new Error(
      `Pack ${slug}: ${pipelinesFile} must be either a single rule set ` +
        `({ name, description, rules: [...] }) or a wrapper ({ ruleSets: [...] }).`,
    );
  }
  return { schemas, pipelines: { ruleSets } };
}

function mergeSchemas(existing, incoming, force) {
  // Existing file is an array of schema definitions; incoming is the same shape.
  // Append by name with optional overwrite.
  const out = Array.isArray(existing) ? [...existing] : [];
  const indexByName = new Map();
  out.forEach((entry, idx) => {
    if (entry && typeof entry.name === 'string') indexByName.set(entry.name, idx);
  });

  let added = 0;
  let skipped = 0;
  let replaced = 0;
  for (const entry of incoming) {
    if (!entry || typeof entry.name !== 'string') {
      // Pack must use named schemas; skip silently rather than corrupt the file.
      continue;
    }
    const existingIdx = indexByName.get(entry.name);
    if (existingIdx == null) {
      out.push(entry);
      indexByName.set(entry.name, out.length - 1);
      added++;
    } else if (force) {
      out[existingIdx] = entry;
      replaced++;
    } else {
      skipped++;
    }
  }
  return { merged: out, added, skipped, replaced };
}

function mergeRuleSets(existing, incoming, force) {
  // Existing file is { ruleSets: [...] }. Incoming pipelines.json has the same
  // shape. Dedupe by rule-set name.
  const out =
    existing && typeof existing === 'object' && Array.isArray(existing.ruleSets)
      ? { ...existing, ruleSets: [...existing.ruleSets] }
      : { ruleSets: [] };

  const indexByName = new Map();
  out.ruleSets.forEach((rs, idx) => {
    if (rs && typeof rs.name === 'string') indexByName.set(rs.name, idx);
  });

  let added = 0;
  let skipped = 0;
  let replaced = 0;
  for (const rs of incoming.ruleSets) {
    if (!rs || typeof rs.name !== 'string') continue;
    const existingIdx = indexByName.get(rs.name);
    if (existingIdx == null) {
      out.ruleSets.push(rs);
      indexByName.set(rs.name, out.ruleSets.length - 1);
      added++;
    } else if (force) {
      out.ruleSets[existingIdx] = rs;
      replaced++;
    } else {
      skipped++;
    }
  }
  return { merged: out, added, skipped, replaced };
}

function isCI() {
  // GitHub Actions sets CI=true; other runners typically do too.
  return process.env.CI === 'true' || process.env.CI === '1';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pack = loadPack(args.slug);

  const schemasFile = path.resolve(args.configPath, 'schemas', 'schemas.json');
  const rulesFile = path.resolve(args.configPath, 'proxy-rules', 'proxy-rules.json');

  const existingSchemas = readJson(schemasFile);
  const existingRules = readJson(rulesFile);

  const schemaResult = mergeSchemas(existingSchemas, pack.schemas, args.force);
  const ruleResult = mergeRuleSets(existingRules, pack.pipelines, args.force);

  writeJson(schemasFile, schemaResult.merged);
  writeJson(rulesFile, ruleResult.merged);

  console.log(`bffless-install ${args.slug}:`);
  console.log(
    `  schemas:    ${schemaResult.added} added, ${schemaResult.replaced} replaced, ${schemaResult.skipped} skipped (already present)`,
  );
  console.log(
    `  rule sets:  ${ruleResult.added} added, ${ruleResult.replaced} replaced, ${ruleResult.skipped} skipped (already present)`,
  );
  console.log(`  wrote:      ${schemasFile}`);
  console.log(`              ${rulesFile}`);

  if (!isCI()) {
    console.warn(
      '\n⚠  bffless-install ran outside CI. The mutation above is intended for the\n' +
        '   CI deploy working tree, not your committed source. Review `git diff` and\n' +
        '   revert before committing if you ran this by accident.',
    );
  }
}

try {
  main();
} catch (err) {
  console.error(`bffless-install: ${err.message}`);
  process.exit(1);
}
