/**
 * Export only public-facing menu fields to JSON snapshots.
 * Used for the static preview during API-key rotation and as an emergency
 * fallback after the Xserver migration.
 *
 * Credentials are read from a private local file (never committed or logged).
 * Run: node scripts/export-public-cms-snapshots.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const KEY_FILE = process.env.TSUBAKITEI_CMS_KEY_FILE
  || path.resolve(ROOT, '..', '.microcms-key');
const HOST = 'tsubakitei-hp.microcms.io';
const API_ROOT = 'https://' + HOST + '/api/v1';
const PAGE_SIZE = 100;
const TIMEOUT_MS = 15000;
const PUBLIC_FIELDS = Object.freeze([
  'id', 'visible', 'menuId', 'menuIdSingle', 'menuIdSelect', 'menu',
  'menuLabel', 'menuDescription', 'sectionName', 'sectionNameSingle',
  'sectionNameSelect', 'sectionDescription', 'subsectionName',
  'store', 'storeSingle', 'storeSelect', 'name', 'description',
  'price', 'priceText', 'sortOrder', 'image', 'imagePath',
  'takeoutAvailable'
]);

function toPublicItem(row) {
  if (row.visible === false) return null;
  const out = {};
  for (const field of PUBLIC_FIELDS) {
    if (row[field] !== undefined) out[field] = row[field];
  }
  if (out.image && typeof out.image === 'object') {
    out.image = { url: out.image.url || '' };
  }
  return out;
}

async function fetchPublishedPages(apiKey, endpoint) {
  const rows = [];
  let total = null;
  while (total === null || rows.length < total) {
    const url = new URL(API_ROOT + '/' + endpoint);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(rows.length));
    url.searchParams.set('orders', 'sortOrder,createdAt');
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'X-MICROCMS-API-KEY': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(endpoint + ' GET HTTP ' + response.status);
    const page = await response.json();
    if (!Array.isArray(page.contents) || !Number.isInteger(page.totalCount)
        || page.offset !== rows.length) {
      throw new Error(endpoint + ' unexpected pagination response');
    }
    total = page.totalCount;
    if (page.contents.length === 0 && rows.length < total) {
      throw new Error(endpoint + ' incomplete pagination');
    }
    rows.push(...page.contents);
  }
  if (rows.length !== total || new Set(rows.map(r => r.id)).size !== total) {
    throw new Error(endpoint + ' count or ID validation failed');
  }
  return rows;
}

async function writeSnapshot(filename, contents) {
  const destination = path.join(ROOT, 'data', filename);
  const pending = destination + '.pending';
  const json = JSON.stringify({ contents }, null, 2) + '\n';
  await fs.writeFile(pending, json, { encoding: 'utf8', mode: 0o644 });
  await fs.rename(pending, destination);
  return contents.length;
}

async function main() {
  const apiKey = (await fs.readFile(KEY_FILE, 'utf8')).trim();
  if (apiKey.length < 20) throw new Error('Private CMS credential not configured');

  // Download both endpoints before changing either file.
  const mainRows = await fetchPublishedPages(apiKey, 'tsubakitei-menus');
  const deliRows = await fetchPublishedPages(apiKey, 'deli-menus');
  const mainPublic = mainRows.map(toPublicItem).filter(Boolean);
  const deliPublic = deliRows.map(toPublicItem).filter(Boolean);

  // Prevent silently replacing the site with incomplete data.
  if (mainRows.length < 100 || deliRows.length < 1) {
    throw new Error('Unusually small CMS result; snapshots not updated');
  }

  await writeSnapshot('tsubakitei-menus-public.json', mainPublic);
  await writeSnapshot('deli-menus-public.json', deliPublic);
  console.log(JSON.stringify({
    exported: {
      tsubakitei: { fetched: mainRows.length, public: mainPublic.length },
      deli: { fetched: deliRows.length, public: deliPublic.length }
    },
    credentialsPrinted: false
  }));
}

main().catch(error => {
  console.error('Export failed:', error.message);
  process.exitCode = 1;
});
