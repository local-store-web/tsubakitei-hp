// No network or CMS writes: exercise the production script with a small DOM/fetch stub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/js/menu.js'), 'utf8');
const price = require('../assets/js/price-format.js');
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
class Element {
  constructor() {
    this.children = []; this.innerHTML = ''; this.className = ''; this.events = {};
    this.classList = {
      add: name => { this.className += ' ' + name; },
      remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); }
    };
  }
  set textContent(value) { this.text = String(value); this.innerHTML = escape(value); }
  get textContent() { return this.text || ''; }
  addEventListener(name, handler) { this.events[name] = handler; }
  appendChild(child) { this.children.push(child); }
  querySelectorAll() { return this.children; }
}
const localMenu = { menus: [{ id: 'menu', name: 'Lunch', sections: [{ name: '予備データ', items: [{ name: '予備商品', price: 100 }] }] }] };
function row(name, menuId, sectionName, sortOrder = 10, extra = {}) {
  return { name, menuId: [menuId], sectionName: [sectionName], sortOrder, priceText: '￥1,200', visible: true, ...extra };
}
async function boot(rows, options = {}) {
  const nodes = Object.fromEntries(['menu-tabs', 'menu-lead', 'menu-body'].map(id => [id, new Element()]));
  const requests = [];
  const logs = [];
  const cfg = { enabled: true, serviceDomain: 'fixture', endpoint: 'tsubakitei-menus', apiKey: 'fixture-only', ...options.config };
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (url === '../data/menu.json') return { ok: true, json: async () => options.local || localMenu };
    const u = new URL(url);
    const offset = Number(u.searchParams.get('offset') || 0);
    const endpoint = u.pathname.split('/').pop();
    if ((options.failPrimary && endpoint === cfg.endpoint) || (options.failSecond && offset > 0)) {
      return { ok: false, status: 500 };
    }
    const data = endpoint === cfg.fallbackEndpoint ? (options.legacy || []) : rows;
    const page = options.emptySecond && offset > 0 ? [] : data.slice(offset, offset + 100);
    return { ok: true, json: async () => ({ contents: structuredClone(page), totalCount: data.length, offset, limit: 100 }) };
  };
  vm.runInNewContext(options.source || source, {
    window: { TSUBAKITEI_MENU_CMS: cfg, TsubakiteiPrice: price }, URL, fetch,
    document: { getElementById: id => nodes[id], createElement: () => new Element() },
    console: { warn: (...args) => logs.push(args), error: (...args) => logs.push(args) }
  });
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  return {
    nodes, requests, logs,
    html: () => nodes['menu-body'].innerHTML,
    tab: name => { const button = nodes['menu-tabs'].children.find(x => x.textContent === name); assert.ok(button, name + ' tab'); button.events.click(); }
  };
}

test('Lunch supports new headings, without hidden or other-store items', async () => {
  const ui = await boot([
    row('主菜', 'Lunch', 'ランチメニュー'),
    row('温泉たまご', 'Lunch', 'トッピングメニュー', 20),
    row('ポテトサラダ', 'Lunch', 'サイドメニュー', 30),
    row('非表示テスト', 'Lunch', '非表示見出し', 40, { visible: false }),
    row('別店舗テスト', 'Lunch', '別店舗見出し', 50, { store: ['deli'] })
  ]);
  assert.ok(ui.html().includes('<h3>トッピングメニュー</h3>'));
  assert.ok(ui.html().includes('<h3>サイドメニュー</h3>'));
  assert.ok(!ui.html().includes('非表示テスト'));
  assert.ok(!ui.html().includes('別店舗テスト'));
  assert.equal((ui.html().match(/class="menu-item"/g) || []).length, 3);
});

test('Dinner renders parent categories and unique optional subheadings', async () => {
  const ui = await boot([
    row('ビール', 'Dinner', 'アルコール', 10),
    row('ウイスキーA', 'Dinner', 'アルコール', 20, { subsectionName: ['ウイスキー各種'] }),
    row('ブランデーA', 'Dinner', 'アルコール', 30, { subsectionName: 'ブランデー' }),
    row('ウイスキーB', 'Dinner', 'アルコール', 40, { subsectionName: 'ウイスキー各種' }),
    row('ジュース', 'Dinner', 'ソフトドリンク', 50)
  ]);
  assert.equal((ui.html().match(/<h3>アルコール<\/h3>/g) || []).length, 1);
  assert.equal((ui.html().match(/>ウイスキー各種<\/h4>/g) || []).length, 1);
  assert.ok(ui.html().indexOf('ウイスキーA') < ui.html().indexOf('ウイスキーB'));
  assert.ok(ui.html().indexOf('ウイスキーB') < ui.html().indexOf('ブランデーA'));
  assert.equal((ui.html().match(/class="menu-item"/g) || []).length, 5);
});

test('Course keeps shared description handling and ignores Dinner-only subcategories', async () => {
  const ui = await boot([
    row('平日コース', 'Course', 'コース料理', 10, { sectionDescription: 'コース案内(税込6,490円～)', subsectionName: ['変更しない'] }),
    row('アルコール', 'Course', 'ドリンク', 20, { sectionDescription: '共通説明\n・ビール\n・ワイン', priceText: '' })
  ]);
  assert.ok(ui.html().includes('<p class="sec-desc">コース案内</p>'));
  assert.ok(ui.html().includes('<div class="desc">(税込6,490円～)</div>'));
  assert.ok(ui.html().includes('<p class="sec-desc">共通説明</p>'));
  assert.ok(ui.html().includes('<div class="desc">・ビール\n・ワイン</div>'));
  assert.ok(!ui.html().includes('menu-subsection'));
});

test('CMS reads all pages, preserving query filters and using GET only', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => row('商品' + i, 'Dinner', 'アルコール', i, { visible: i !== 1 }));
  const ui = await boot(rows, { config: { queries: 'limit=100&orders=sortOrder&filters=visible[equals]true' } });
  assert.equal((ui.html().match(/class="menu-item"/g) || []).length, 204);
  assert.ok(ui.html().includes('商品204'));
  assert.deepEqual(ui.requests.map(r => Number(new URL(r.url).searchParams.get('offset'))), [0, 100, 200]);
  for (const req of ui.requests) {
    assert.equal(req.init.method || 'GET', 'GET');
    assert.equal(new URL(req.url).searchParams.get('filters'), 'visible[equals]true');
  }
});

test('A failed later page does not mix partial CMS data with local fallback', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => row('CMS商品' + i, 'Dinner', 'アルコール', i));
  const ui = await boot(rows, { failSecond: true });
  assert.ok(ui.html().includes('予備商品'));
  assert.ok(!ui.html().includes('CMS商品'));
  assert.ok(ui.logs.length > 0);
});

test('Unexpected empty later page falls back rather than silently dropping items', async () => {
  const ui = await boot(Array.from({ length: 105 }, (_, i) => row('商品' + i, 'Lunch', 'ランチメニュー', i)), { emptySecond: true });
  assert.ok(ui.html().includes('予備商品'));
});

test('Legacy CMS fallback is also paginated', async () => {
  const ui = await boot([], {
    config: { fallbackEndpoint: 'menus' }, failPrimary: true,
    legacy: Array.from({ length: 102 }, (_, i) => row('旧API商品' + i, 'Lunch', 'ランチメニュー', i))
  });
  assert.ok(ui.html().includes('旧API商品101'));
  assert.equal((ui.html().match(/class="menu-item"/g) || []).length, 102);
});

test('New subcategory headings are escaped; blank fields keep old layout', async () => {
  const ui = await boot([row('品名', 'Dinner', 'アルコール', 10, { subsectionName: '<script>alert(1)</script>', priceText: '時価（スタッフにお尋ねください）' })]);
  assert.ok(ui.html().includes('&lt;script&gt;'));
  assert.ok(!ui.html().includes('<script>'));
  assert.ok(ui.html().includes('時価（スタッフにお尋ねください）'));
  const flat = await boot([row('品名', 'Dinner', 'アルコール', 10, { subsectionName: [] })]);
  assert.ok(!flat.html().includes('menu-subsection'));
});

test('Dinner moves item notes into their cards and shows TO only for flagged items', async () => {
  const ui = await boot([
    row('ハンバーグステーキ 定食　■Sサイズ　■Mサイズ　■Lサイズ', 'Dinner', 'ディナーメニュー', 10, {
      sectionDescription: '※Sサイズには温泉たまごは付きません。100円で付けられます。\nLサイズ以上のオーダーも可能です。',
      priceText: '■S定食 ￥1,250・S単品 ￥1,050　■M定食 ￥1,450・M単品 ￥1,250　■L定食 ￥1,650・L単品 ￥1,450',
      takeoutAvailable: true
    }),
    row('豚ロース生姜焼き　■Sサイズ　■Mサイズ　■Lサイズ', 'Dinner', 'ディナーメニュー', 20, {
      sectionDescription: '100円で玉ねぎが一緒に焼けます。', takeoutAvailable: true,
      priceText: '■S定食 ￥1,250　■M定食 ￥1,450　■L定食 ￥1,650'
    }),
    row('対象外', 'Dinner', 'ディナーメニュー', 30)
  ]);
  ui.tab('Dinner');
  assert.ok(!ui.html().includes('class="sec-desc"'));
  assert.ok(ui.html().includes('カッコ内は税込価格です。'));
  assert.equal((ui.html().match(/※Sサイズには/g) || []).length, 1);
  assert.equal((ui.html().match(/class="takeout-badge"/g) || []).length, 2);
  assert.equal((ui.html().match(/M・Lサイズのみ/g) || []).length, 2);
  assert.equal((ui.html().match(/class="menu-main-group"/g) || []).length, 1);
  assert.ok(ui.html().includes('1,250'));
  assert.ok(!/[¥￥]/.test(ui.html()));
  assert.ok(ui.html().includes('<span class="size-price-line">'));
});

test('Price formatter removes currency marks and each, groups thousands, and preserves ordinary text', () => {
  assert.equal(price.formatPriceText('￥550（税込￥605） / ¥700'), '550（税込605） / 700');
  assert.equal(price.formatPriceText('Sサイズ 1100 / Mサイズ 1200 / 各￥200 / 1400'), 'Sサイズ 1,100 / Mサイズ 1,200 / 200 / 1,400');
  assert.equal(price.formatDinnerPriceText('￥550（税込￥605） / 1500(1650)'), '550 (605) / 1,500 (1,650)');
  assert.equal(price.formatDinnerPriceText('850(935)  (＋300円でトッピング)'), '850 (935)  (＋300円でトッピング)');
  assert.equal(price.formatPriceText('150円（税別）'), '150円（税別）');
});

test('Local fallback retains image, size prices and description-only sections', async () => {
  const local = { menus: [{ id: 'menu', sections: [
    { name: 'ランチメニュー', items: [{ name: '主菜', image: 'assets/img/fixture.png', variants: [{ name: 'S', price: 1100 }, { name: 'M', price: 1200 }] }] },
    { name: '共通案内', description: '案内本文', items: [] }
  ] }] };
  const ui = await boot([], { config: { enabled: false }, local });
  assert.ok(ui.html().includes('src="../assets/img/fixture.png"'));
  assert.ok(ui.html().includes('<small>S</small> 1,100 / <small>M</small> 1,200'));
  assert.ok(ui.html().includes('<h3>共通案内</h3>'));
  assert.equal(ui.requests.length, 1);
});
