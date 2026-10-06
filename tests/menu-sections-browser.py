"""Browser regression against real site files with synthetic, read-only CMS responses."""
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'menu-sections'
OUT.mkdir(parents=True, exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'

def row(name, menu, section, order, **extra):
    return dict(name=name, menuId=[menu], sectionName=[section], sortOrder=order,
                priceText='￥1,200', visible=True, **extra)

# Prices and images are fixtures, never imported into microCMS or local menu data.
rows = [
    row('A. ハンバーグステーキ', 'Lunch', 'ランチメニュー', 10, imagePath='assets/img/fixture.svg'),
    row('D. エビフライ（数量限定）', 'Lunch', 'ランチメニュー', 20, imagePath='assets/img/fixture.svg'),
    row('温泉たまご', 'Lunch', 'トッピングメニュー', 30),
    row('洋食屋のポテトサラダ', 'Lunch', 'サイドメニュー', 40),
    row('生ビール', 'Dinner', 'アルコール', 50),
    row('I・W ハーパー', 'Dinner', 'アルコール', 60, subsectionName=['ウイスキー各種']),
    row('ブランデーのテスト商品', 'Dinner', 'アルコール', 70, subsectionName='ブランデー'),
    row('山崎 12年', 'Dinner', 'アルコール', 80, subsectionName='ウイスキー各種'),
    row('ウーロン茶', 'Dinner', 'ソフトドリンク', 90),
]
rows[0]['priceText'] = 'Sサイズ（150g） ￥1,100 / Mサイズ（185g） ￥1,200'
rows[1]['priceText'] = 'Sサイズ（エビ2本） ￥1,100 / Mサイズ（エビ3本） ￥1,300'
rows[7]['priceText'] = '時価（スタッフにお尋ねください）'
rows += [row(f'非表示fixture{i}', 'Dinner', '非表示見出し', 100+i) for i in range(101)]
for r in rows[9:]:
    r['visible'] = False
rows += [row('平日コース', 'Course', 'コース料理', 300, subsectionName=['無視する小分類'], sectionDescription='コース案内(税込6,490円～)')]
rows.sort(key=lambda r: r['sortOrder'])
config = 'window.TSUBAKITEI_MENU_CMS = ' + json.dumps(dict(enabled=True, serviceDomain='fixture', endpoint='tsubakitei-menus', apiKey='fixture-only', queries='limit=100&orders=sortOrder')) + ';'

def install_routes(context, offsets):
    context.route('**/assets/js/menu-config.js*', lambda route: route.fulfill(content_type='application/javascript', body=config))
    context.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(content_type='text/css', body=''))
    context.route('https://fonts.gstatic.com/**', lambda route: route.abort())
    context.route('**/assets/img/**', lambda route: route.fulfill(content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74"><rect width="74" height="74" fill="#efe5c9"/></svg>'))
    def cms(route):
        assert route.request.method in ('GET', 'OPTIONS'), 'Tests never write to CMS'
        if route.request.method == 'OPTIONS':
            return route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'})
        offset = int(parse_qs(urlparse(route.request.url).query)['offset'][0])
        offsets.append(offset)
        return route.fulfill(content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body=json.dumps(dict(contents=rows[offset:offset+100], totalCount=len(rows), offset=offset, limit=100)))
    context.route('https://fixture.microcms.io/api/v1/**', cms)

try:
    with sync_playwright() as p:
        for engine in ('chromium', 'webkit'):
            browser = getattr(p, engine).launch()
            for width in (320, 375, 390, 430, 1280):
                with browser.new_context(viewport={'width': width, 'height': 900}, is_mobile=width < 500, has_touch=width < 500) as context:
                    offsets, errors = [], []
                    install_routes(context, offsets)
                    page = context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(origin + '/menu/', wait_until='networkidle')
                    expect(page.locator('#menu-body .menu-item')).to_have_count(4)
                    assert '￥' not in page.locator('#menu-body').inner_text()
                    expect(page.locator('#menu-body h3')).to_have_text(['ランチメニュー', 'トッピングメニュー', 'サイドメニュー'])
                    assert offsets == [0, 100], offsets
                    if width < 500:
                        assert page.locator('.menu-item .name').first.bounding_box()['width'] > 140
                        assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
                        assert page.locator('.menu-item .price').first.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
                    if width == 390:
                        page.screenshot(path=str(OUT / f'{engine}-lunch-fixture.png'), full_page=True)
                    page.get_by_role('button', name='Dinner', exact=True).click()
                    expect(page.locator('#menu-body h3')).to_have_text(['アルコール', 'ソフトドリンク'])
                    expect(page.locator('#menu-body h4')).to_have_text(['ウイスキー各種', 'ブランデー'])
                    expect(page.locator('#menu-body .menu-item')).to_have_count(5)
                    assert '￥' not in page.locator('#menu-body').inner_text()
                    assert '非表示fixture' not in page.locator('#menu-body').inner_text()
                    assert page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1')
                    if width == 390:
                        page.screenshot(path=str(OUT / f'{engine}-dinner-fixture.png'), full_page=True)
                    page.get_by_role('button', name='Course', exact=True).click()
                    expect(page.locator('#menu-body h4')).to_have_count(0)
                    expect(page.locator('#menu-body .sec-desc')).to_have_text('コース案内')
                    expect(page.locator('#menu-body .desc')).to_have_text('(税込6,490円～)')
                    assert not errors, errors
                    print(f'PASS {engine} {width}px: Lunch, Dinner, Course, pagination, wrapping')
            browser.close()
finally:
    server.shutdown()
    server.server_close()
