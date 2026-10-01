# microCMS Hobby メニュー更新設計

目的: microCMS Hobby 0円枠のまま、店主がスマホからメニューの金額・写真・表示状態を変更できるようにする。

## コスト方針

- GitHub Pages: 0円
- microCMS Hobby: 0円/月
- Wix: ドメイン契約のみ維持
- microCMS Teamには上げない

## API構成

| 店舗 | API名 | エンドポイント | 用途 |
|---|---|---|---|
| 洋食ツバキ亭 | ツバキ亭メニュー | `tsubakitei-menus` | Lunch / Dinner / Course |
| ツバキ&デリ | デリメニュー | `deli-menus` | デリ商品20枠 |
| 3号店 | 3号店メニュー | `store3-menus` | 将来用。現在は空 |

旧`menus` APIは移行確認まで残し、サイト側の一時fallbackにだけ使う。2店舗分の表示確認後に削除する。

## ツバキ亭のフィールド

| 表示名 | フィールドID | 種類 | 選択肢 |
|---|---|---|---|
| 表示する | `visible` | 真偽値 | - |
| メニュー区分 | `menuId` | セレクト（単一） | Lunch / Dinner / Course |
| セクション名 | `sectionName` | セレクト（単一） | ランチメニュー / 単品 / ソフトドリンク / アルコール / ディナーメニュー / デザートメニュー / ドリンク / コース料理 / メニュー例 / トッピングメニュー / サイドメニュー |
| 小分類 | `subsectionName` | セレクト（単一・任意） | ウイスキー各種 / ブランデー / 日本酒 / リキュール |
| 品名 | `name` | テキスト | - |
| セクション説明 | `sectionDescription` | テキストエリア | - |
| 金額表示 | `priceText` | テキスト | - |
| 写真 | `image` | 画像 | - |
| 既存写真パス | `imagePath` | テキスト | - |
| 並び順 | `sortOrder` | 数字 | 10刻み |

## デリのフィールド

| 表示名 | フィールドID | 種類 |
|---|---|---|
| 表示する | `visible` | 真偽値 |
| 品名 | `name` | テキスト |
| 金額表示 | `priceText` | テキスト |
| 写真 | `image` | 画像 |
| 既存写真パス | `imagePath` | テキスト |
| 並び順 | `sortOrder` | 数字 |

店主が普段触るのは`表示する`、`品名`、`金額表示`、`写真`だけ。`既存写真パス`と`並び順`は初期設定用。

## 入力ルール

- 金額は`￥1,200`のように`金額表示`へ表示したい文字をそのまま入力する
- S/L価格は`S ￥650 / L ￥750`のように入力する
- `写真`がある場合は`既存写真パス`より優先表示する
- 並び順は10、20、30の順。小さい数字が上
- 一時的に隠す場合は`表示する`をOFFにする

## サイト側設定

ツバキ亭は`assets/js/menu-config.js`、デリは`assets/js/deli-menu-config.js`で別エンドポイントを指定する。

```js
window.TSUBAKITEI_MENU_CMS = {
  enabled: true,
  serviceDomain: "tsubakitei-hp",
  endpoint: "tsubakitei-menus",
  apiKey: "GET専用APIキー",
  queries: "limit=100&orders=sortOrder"
};
```

```js
window.TSUBAKITEI_DELI_MENU_CMS = {
  enabled: true,
  serviceDomain: "tsubakitei-hp",
  endpoint: "deli-menus",
  apiKey: "GET専用APIキー",
  queries: "limit=100&orders=sortOrder"
};
```

APIキーは必ずGET専用にする。ブラウザへ置くキーにPOST、PUT、PATCH、DELETEを付けない。

## 初回投入

1. `node scripts/build-microcms-menu-import.mjs`を実行
2. `data/microcms-tsubakitei-menus-import.csv`を`tsubakitei-menus`へ投入
3. `data/microcms-deli-menus-import.csv`を`deli-menus`へ投入
4. ツバキ亭60件、デリ20件、3号店0件であることを確認
5. APIキーをGET専用に戻す
6. PC・スマホでツバキ亭とデリの表示を確認

画像フィールドへCSVで直接入れられるのはmicroCMS配信URLだけ。既存画像は`imagePath`へ入れ、今後の差し替え時に`写真`へアップロードする。

## fallback

新API取得に失敗した場合は、移行中のみ旧`menus` APIを読む。旧API削除後は`fallbackEndpoint`を削除し、最終fallbackとしてローカルJSONを使う。

## セキュリティ

- 公開サイトで使うAPIキーはGETのみ
- HobbyはAPIキーが1本のため、新2 APIへGET可能な状態で運用する
- 初期投入時に一時的な書込権限を付けた場合、投入直後に必ず解除する
- APIキーを変更した場合は両configを同時に差し替える
