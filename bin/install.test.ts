import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Resolve once at module load — vitest can collect from any cwd.
const CLI = path.resolve(__dirname, 'install.js');

function run(cwd: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return execFileSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, CI: 'true', ...extraEnv },
  });
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bffless-install-test-'));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ─── Fresh install (no existing .bffless/ files) ─────────────────────────────

describe('bffless-install — fresh consumer', () => {
  it('writes pack schemas + rule sets into .bffless/ when neither file exists', () => {
    run(tmp, ['scheduling']);

    const schemas = readJson(path.join(tmp, '.bffless/schemas/schemas.json')) as Array<{ name: string }>;
    const rules = readJson(path.join(tmp, '.bffless/proxy-rules/proxy-rules.json')) as {
      ruleSets: Array<{ name: string }>;
    };

    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.map((s) => s.name)).toContain('scheduling_service');
    expect(schemas.map((s) => s.name)).toContain('scheduling_booking');

    expect(rules.ruleSets.length).toBe(1);
    expect(rules.ruleSets[0].name).toBe('scheduling');
  });
});

// ─── Merge into pre-existing template files ──────────────────────────────────

describe('bffless-install — existing consumer files', () => {
  it("appends without clobbering the template's own schemas + rule set", () => {
    // Pre-seed the consumer with template-authored config.
    fs.mkdirSync(path.join(tmp, '.bffless/schemas'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.bffless/proxy-rules'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.bffless/schemas/schemas.json'),
      JSON.stringify(
        [
          {
            name: 'contact_submissions',
            fields: [{ name: 'email', type: 'string', required: true }],
          },
        ],
        null,
        2,
      ),
    );
    fs.writeFileSync(
      path.join(tmp, '.bffless/proxy-rules/proxy-rules.json'),
      JSON.stringify(
        {
          ruleSets: [
            {
              name: 'site',
              description: "Template's own rules",
              rules: [{ pathPattern: '/api/contact', method: 'POST', proxyType: 'pipeline' }],
            },
          ],
        },
        null,
        2,
      ),
    );

    run(tmp, ['scheduling']);

    const schemas = readJson(path.join(tmp, '.bffless/schemas/schemas.json')) as Array<{ name: string }>;
    const rules = readJson(path.join(tmp, '.bffless/proxy-rules/proxy-rules.json')) as {
      ruleSets: Array<{ name: string }>;
    };

    // Template's own schema is preserved at index 0.
    expect(schemas[0].name).toBe('contact_submissions');
    // Pack schemas appended after.
    expect(schemas.map((s) => s.name)).toContain('scheduling_service');

    // Template's own rule set + pack rule set both present.
    expect(rules.ruleSets.map((rs) => rs.name)).toEqual(['site', 'scheduling']);
  });
});

// ─── Idempotence ─────────────────────────────────────────────────────────────

describe('bffless-install — idempotence', () => {
  it('is a no-op on the second run (skips entries already present by name)', () => {
    run(tmp, ['scheduling']);
    const after1 = fs.readFileSync(path.join(tmp, '.bffless/schemas/schemas.json'), 'utf-8');
    const rules1 = fs.readFileSync(path.join(tmp, '.bffless/proxy-rules/proxy-rules.json'), 'utf-8');

    const out2 = run(tmp, ['scheduling']);
    const after2 = fs.readFileSync(path.join(tmp, '.bffless/schemas/schemas.json'), 'utf-8');
    const rules2 = fs.readFileSync(path.join(tmp, '.bffless/proxy-rules/proxy-rules.json'), 'utf-8');

    expect(after1).toBe(after2);
    expect(rules1).toBe(rules2);
    expect(out2).toMatch(/0 added/);
    expect(out2).toMatch(/skipped/);
  });

  it('--force overwrites existing entries with the pack version', () => {
    // Pre-seed a STALE scheduling_service entry that the pack should replace.
    fs.mkdirSync(path.join(tmp, '.bffless/schemas'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.bffless/schemas/schemas.json'),
      JSON.stringify(
        [{ name: 'scheduling_service', fields: [{ name: 'old', type: 'string', required: false }] }],
        null,
        2,
      ),
    );

    run(tmp, ['scheduling', '--force']);

    const schemas = readJson(path.join(tmp, '.bffless/schemas/schemas.json')) as Array<{
      name: string;
      fields: Array<{ name: string }>;
    }>;
    const service = schemas.find((s) => s.name === 'scheduling_service');
    expect(service).toBeDefined();
    // Pack defines several fields beyond just "old" — overwrite worked if we
    // see anything other than the stale single-field shape.
    expect(service!.fields.length).toBeGreaterThan(1);
  });
});

// ─── Errors ──────────────────────────────────────────────────────────────────

describe('bffless-install — errors', () => {
  it('exits non-zero with a useful message when the slug is missing', () => {
    expect(() =>
      execFileSync('node', [CLI, 'no-such-pack'], {
        cwd: tmp,
        encoding: 'utf-8',
        env: { ...process.env, CI: 'true' },
      }),
    ).toThrowError(/Install pack not found/);
  });

  it('exits non-zero when no slug positional is given', () => {
    expect(() =>
      execFileSync('node', [CLI], {
        cwd: tmp,
        encoding: 'utf-8',
        env: { ...process.env, CI: 'true' },
      }),
    ).toThrowError();
  });
});

// ─── Custom config-path ──────────────────────────────────────────────────────

describe('bffless-install — --config-path', () => {
  it('writes to the supplied directory', () => {
    run(tmp, ['scheduling', '--config-path', 'custom-bffless']);
    expect(fs.existsSync(path.join(tmp, 'custom-bffless/schemas/schemas.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'custom-bffless/proxy-rules/proxy-rules.json'))).toBe(true);
  });
});
