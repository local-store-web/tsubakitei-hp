/**
 * Assemble only the files intended for Xserver public_html.
 * Never upload a git checkout, developer files, keys, or backups.
 *
 * Run: node scripts/package-xserver-site.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEST = path.join(ROOT, 'dist', 'xserver-public_html');
const TOP_FILES = ['index.html', '404.html', 'robots.txt', 'sitemap.xml'];
const FOLDERS = ['about', 'access', 'assets', 'deli', 'gallery', 'home',
  'menu', 'recruit', 'reserve', 'takeout'];
const PUBLIC_DATA = ['menu.json', 'deli-menu.json',
  'tsubakitei-menus-public.json', 'deli-menus-public.json'];

async function copyVisibleTree(from, to) {
  const st = await fs.lstat(from);
  if (st.isSymbolicLink()) throw new Error('Symlinks forbidden in publish tree');
  if (st.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    for (const entry of await fs.readdir(from)) {
      if (entry.startsWith('.')) continue;
      await copyVisibleTree(path.join(from, entry), path.join(to, entry));
    }
    return;
  }
  if (!st.isFile()) throw new Error('Unexpected filesystem entry in publish tree');
  await fs.copyFile(from, to);
}

async function visit(directory, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(filename, files);
    else files.push(filename);
  }
  return files;
}

async function main() {
  const mainRows = JSON.parse(await fs.readFile(
    path.join(ROOT, 'data/tsubakitei-menus-public.json'), 'utf8')).contents;
  const deliRows = JSON.parse(await fs.readFile(
    path.join(ROOT, 'data/deli-menus-public.json'), 'utf8')).contents;
  if (!Array.isArray(mainRows) || mainRows.length < 100
      || !Array.isArray(deliRows) || deliRows.length < 1) {
    throw new Error('Public snapshots are missing or unexpectedly incomplete');
  }

  await fs.rm(DEST, { recursive: true, force: true });
  await fs.mkdir(DEST, { recursive: true });
  for (const file of TOP_FILES) {
    await fs.copyFile(path.join(ROOT, file), path.join(DEST, file));
  }
  for (const folder of FOLDERS) {
    await copyVisibleTree(path.join(ROOT, folder), path.join(DEST, folder));
  }
  await fs.mkdir(path.join(DEST, 'data'));
  for (const file of PUBLIC_DATA) {
    await fs.copyFile(path.join(ROOT, 'data', file), path.join(DEST, 'data', file));
  }
  await fs.mkdir(path.join(DEST, 'api'));
  await fs.copyFile(path.join(ROOT, 'api/menu.php'), path.join(DEST, 'api/menu.php'));

  const files = await visit(DEST);
  if (files.some(file => /(^|\/)(\.git|\.env|_private|private|scripts|tests|docs)(\/|$)/.test(file))) {
    throw new Error('A forbidden folder was included in the publish tree');
  }

  // Read only to detect accidental key re-exposure. Never print or copy the key.
  let oldKey = '';
  try {
    oldKey = (await fs.readFile(path.join(ROOT, '..', '.microcms-key'), 'utf8')).trim();
  } catch { /* When rotating, the old key file may already be removed. */ }

  const publicFiles = files.filter(file => /\.(html|js|json|php|css|xml|txt)$/.test(file));
  for (const file of publicFiles) {
    const content = await fs.readFile(file, 'utf8');
    if (oldKey.length >= 20 && content.includes(oldKey)) {
      throw new Error('Public bundle contains the previously exposed CMS credential');
    }
    if (/apiKey\s*:\s*["'][A-Za-z0-9]{20,}/.test(content)) {
      throw new Error('Hardcoded API credential pattern found in publish bundle');
    }
  }

  const summary = {
    files: files.length,
    data: { tsubakitei: mainRows.length, deli: deliRows.length },
    sha256: crypto.createHash('sha256')
      .update((await fs.readFile(path.join(DEST, 'assets/js/menu-config.js'))))
      .digest('hex'),
    folder: DEST,
    credentialsIncluded: false
  };
  console.log(JSON.stringify(summary));
}
main().catch(error => {
  console.error('Packaging failed:', error.message);
  process.exitCode = 1;
});
