// Read-only regression for the public snapshots used during credential rotation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const price = require('../assets/js/price-format.js');

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}
function documentElement() {
  const el = { innerHTML: '', children: [], events: {}, className: '' };
  el.classList = {
    add: value => { el.className += ' ' + value; },
    remove: value => { el.className = el.className.replace(value, '').trim(); }
  };
  Object.defineProperty(el, 'textContent', {
    set(value) { el.text = String(value); el.innerHTML = el.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    get() { return el.text || ''; }
  });
  el.addEventListener = (name, callback) => { el.events[name] = callback; };
  el.appendChild = child => el.children.push(child);
  el.querySelectorAll = () => el.children;
  return el;
}
async function flush() {
  for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
}

test('public configs and snapshots do not contain embedded API credentials', () => {
  const files = [
    'assets/js/menu-config.js',
    'assets/js/deli-menu-config.js',
    'data/tsubakitei-menus-public.json',
    'data/deli-menus-public.json'
  ];
  for (const file of files) {
    const text = source(file);
    assert.doesNotMatch(text, /apiKey\s*:\s*["'][A-Za-z0-9]{20,}/, file);
    assert.doesNotMatch(text, /X-MICROCMS-API-KEY\s*:\s*[A-Za-z0-9]{20,}/, file);
  }
});

test('main menu displays all three sections from public snapshot without API requests', async () => {
  const snapshot = JSON.parse(source('data/tsubakitei-menus-public.json'));
  assert.equal(snapshot.contents.length, 101);
  assert.ok(snapshot.contents.every(row => row.visible !== false));

  const elements = {};
  for (const id of ['menu-tabs', 'menu-lead', 'menu-body']) {
    elements[id] = documentElement();
  }
  const requests = [];
  const context = {
    window: { location: { hostname: 'local-store-web.github.io' }, TsubakiteiPrice: price },
    document: {
      getElementById: id => elements[id],
      createElement: () => documentElement()
    },
    fetch: async url => {
      requests.push(url);
      assert.equal(url, '../data/tsubakitei-menus-public.json');
      return { ok: true, json: async () => snapshot };
    },
    console: { warn() {}, error() {} },
    URL
  };
  vm.runInNewContext(source('assets/js/menu-config.js'), context);
  assert.equal(context.window.TSUBAKITEI_MENU_CMS.enabled, false);
  assert.equal(context.window.TSUBAKITEI_MENU_CMS.proxyUrl, '');
  vm.runInNewContext(source('assets/js/menu.js'), context);
  await flush();

  assert.deepEqual(
    Array.from(elements['menu-tabs'].children, x => x.textContent),
    ['Lunch', 'Dinner', 'Course']
  );
  assert.match(elements['menu-body'].innerHTML, /ハンバーグステーキ/);
  assert.match(elements['menu-body'].innerHTML, /トッピングメニュー/);
  assert.ok((elements['menu-body'].innerHTML.match(/class="menu-item(?: |")/g) || []).length >= 25);

  const dinner = elements['menu-tabs'].children[1];
  dinner.events.click();
  assert.match(elements['menu-body'].innerHTML, /ウイスキー各種/);
  assert.match(elements['menu-body'].innerHTML, /TO可/);
  assert.ok((elements['menu-body'].innerHTML.match(/class="menu-item(?: |")/g) || []).length >= 60);

  elements['menu-tabs'].children[2].events.click();
  assert.match(elements['menu-body'].innerHTML, /コース/);
  assert.deepEqual(requests, ['../data/tsubakitei-menus-public.json']);
});

test('deli preview loads its public snapshot with no CMS authentication', async () => {
  const snapshot = JSON.parse(source('data/deli-menus-public.json'));
  assert.equal(snapshot.contents.length, 20);
  const body = documentElement();
  const requests = [];
  const context = {
    window: { location: { hostname: 'local-store-web.github.io' }, TsubakiteiPrice: price },
    document: {
      currentScript: { getAttribute: () => '../../assets/js/deli-menu.js?v=9' },
      getElementById: id => id === 'deli-menu-body' ? body : null,
      createElement: () => documentElement()
    },
    fetch: async url => {
      requests.push(url);
      assert.equal(url, '../../data/deli-menus-public.json');
      return { ok: true, json: async () => snapshot };
    },
    console: { warn() {}, error() {} },
    URL
  };
  vm.runInNewContext(source('assets/js/deli-menu-config.js'), context);
  assert.equal(context.window.TSUBAKITEI_DELI_MENU_CMS.enabled, false);
  assert.equal(context.window.TSUBAKITEI_DELI_MENU_CMS.proxyUrl, '');
  vm.runInNewContext(source('assets/js/deli-menu.js'), context);
  await flush();
  assert.ok(body.innerHTML.length > 0);
  assert.deepEqual(requests, ['../../data/deli-menus-public.json']);
});

test('canonical domain selects same-origin proxy but no exposed API key', () => {
  const context = { window: { location: { hostname: 'www.tsubakitei.com' } } };
  vm.runInNewContext(source('assets/js/menu-config.js'), context);
  assert.equal(context.window.TSUBAKITEI_MENU_CMS.proxyUrl, '/api/menu.php?store=tsubakitei');
  vm.runInNewContext(source('assets/js/deli-menu-config.js'), context);
  assert.equal(context.window.TSUBAKITEI_DELI_MENU_CMS.proxyUrl, '/api/menu.php?store=deli');
});
