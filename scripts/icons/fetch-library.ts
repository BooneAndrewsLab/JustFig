/**
 * Puts the pinned icon library (icons.lock.json) into public/lib/<version>/
 * (note 01). `npm run icons`; `predev`/`prebuild` run it with --if-missing.
 *
 * Where it comes from, first match wins:
 *   1. --from DIR, or $JUSTFIG_ICONS_DIST: a built justfig-icons dist/;
 *   2. ../justfig-icons/dist, a sibling checkout built with `npm run build`;
 *   3. the release tarball at the lock file's URL, checked against its SHA-256
 *      (what deploy.yml and CI do). The icons repository is private, so with
 *      $JUSTFIG_ICONS_TOKEN set the asset is fetched through the GitHub API
 *      with that token (a fine-grained token that can read justfig-icons).
 * A local dist/ must carry the pinned version, so a stale build is never used.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

interface Lock {
  version: string;
  url: string;
  sha256: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values } = parseArgs({
  options: { 'if-missing': { type: 'boolean' }, from: { type: 'string' } },
});
const lock = JSON.parse(readFileSync(join(root, 'icons.lock.json'), 'utf8')) as Lock;
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(lock.version))
  throw new Error('icons.lock.json: bad version');
const target = join(root, 'public', 'lib', lock.version);

const versionOf = (dir: string): string | null => {
  const p = join(dir, 'manifest.json');
  if (!existsSync(p)) return null;
  return (JSON.parse(readFileSync(p, 'utf8')) as { version?: string }).version ?? null;
};

if (values['if-missing'] === true && versionOf(target) === lock.version) process.exit(0);

const candidates = [
  values.from,
  process.env['JUSTFIG_ICONS_DIST'],
  join(root, '..', 'justfig-icons', 'dist'),
].filter((x): x is string => typeof x === 'string' && x !== '');

for (const c of candidates) {
  const dir = resolve(c);
  const v = versionOf(dir);
  if (v === null) continue;
  if (v !== lock.version) {
    console.warn(`icons: ${dir} is version ${v}, the app pins ${lock.version}; skipped`);
    continue;
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(dir, target, { recursive: true });
  console.warn(`icons: copied ${lock.version} from ${dir}`);
  process.exit(0);
}

// A private repository's release asset is only reachable through the API.
const download = async (url: string, token: string | undefined): Promise<Response> => {
  if (token === undefined || token === '') return fetch(url);
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(
    url,
  );
  if (m === null) throw new Error(`icons: ${url} is not a GitHub release asset URL`);
  const [, owner, repo, tag, name] = m as unknown as [string, string, string, string, string];
  const auth = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const rel = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    headers: { ...auth, Accept: 'application/vnd.github+json' },
  });
  if (!rel.ok) return rel;
  const { assets } = (await rel.json()) as { assets: { name: string; url: string }[] };
  const asset = assets.find((a) => a.name === name);
  if (asset === undefined) throw new Error(`icons: release ${tag} has no asset ${name}`);
  return fetch(asset.url, { headers: { ...auth, Accept: 'application/octet-stream' } });
};

console.warn(`icons: downloading ${lock.url}`);
const res = await download(lock.url, process.env['JUSTFIG_ICONS_TOKEN']);
if (!res.ok)
  throw new Error(
    `icons: ${lock.url} → ${String(res.status)}. The justfig-icons repository is private: set ` +
      'JUSTFIG_ICONS_TOKEN, build ../justfig-icons (npm run fetch && npm run build) or pass --from <dist>.',
  );
const body = Buffer.from(await res.arrayBuffer());
const sha = createHash('sha256').update(body).digest('hex');
if (sha !== lock.sha256)
  throw new Error(`icons: SHA-256 mismatch for ${lock.url} (got ${sha}, pinned ${lock.sha256})`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const tgz = join(target, '..', `.justfig-icons-${lock.version}.tar.gz`);
writeFileSync(tgz, body);
try {
  execFileSync('tar', ['-xzf', tgz, '-C', target, '--no-same-owner'], { stdio: 'inherit' });
} finally {
  rmSync(tgz, { force: true });
}
if (versionOf(target) !== lock.version) throw new Error('icons: the tarball has the wrong version');
console.warn(`icons: ${lock.version} unpacked into public/lib/${lock.version}/`);
