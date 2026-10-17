# ツバキ亭｜microCMSキー失効・Xserver移行の手順（2026-10-17）

対象ドメイン：tsubakitei.com
移行先：YOSHI管理の既存Xserverレンタルサーバー（Chill Laboとは別のドメイン領域）
メール：既存ロリポップのまま維持。MX・メール関連DNS・ネームサーバーは変更しない。

## 現在の事前準備

作業ブランチ：security/remove-browser-microcms-key-20261017

- 最新メニューデータをAPIから取得して公開用JSONを作成済み
- ブラウザのJS設定ファイルからAPIキーを除去したコードを用意済み
- 静的プレビューではJSON、tsubakitei.comではXserverのサーバー側取得口を使う構成
- サーバー側通信に失敗したら静的JSONにフォールバック
- Xserverへの公開物は許可したファイルだけを組み立てる
- **まだ公開・プッシュ・旧キー失効はしていない**

## 帰宅後の安全な順番

1. 最新データの再取得：node scripts/export-public-cms-snapshots.mjs
2. テスト：node --test tests/menu-sections.test.cjs tests/public-snapshot.test.cjs
3. Github Pagesのプレビューにキー無しJS・JSONを先に反映し、正常表示とファイル更新を確認
4. microCMS管理画面からAPIキーを再発行。旧キーの失効を確認。新キーはGitHub・公開JS・LINEに貼らない
5. 新キーはAPIごとのGET専用権限に絞り、POST/PATCH/DELETEを許可しない。画面で再確認
6. Xserverでtsubakitei.com用の公開領域をChill Laboとは別に用意し、HTTPSとPHPを確認
7. node scripts/package-xserver-site.mjs で dist/xserver-public_html を生成し、中身だけXserverへ配置。Git作業ツリーや秘密情報を公開しない
8. 新キーをXserver公開領域の外に保管。パス例：ドメインディレクトリの _private/tsubakitei-microcms.key
9. DNS切替前にXserverの公開ページ・API取得口・スナップショットの代替表示・秘密情報非露出を検証
10. SEO：旧URLと新URLの対応表、301、OGP、robots.txt、sitemap.xmlを準備
11. 全件検証に成功した場合のみ、ムームーDNSでWeb向け設定を変更。MX・メール用・NSは変更しない
12. 公開後はHTTPS、全ページ、写真、メニュー、旧URLの301、店舗メールの送信と受信を確認

## 失敗時の対応

- Xserverへの切替が未完ならDNSは変更しない
- サーバーのCMS取得失敗時は公開用JSONへフォールバック
- 旧APIキーはGit履歴に残っている可能性があるため、ファイル除去だけで済ませず失効が必須
- ロリポップの独自ドメイン設定の解除・メールボックス削除・契約解約は禁止

## 未検証の点

MacにはPHP CLIがなく、api/menu.phpの構文・Xserver固有設定はまだ未検証。
XserverのPHPバージョンとcURL拡張、公開領域外のシークレット保管先を本番作業前に確認する。
不用意なGitHub Actions課金を避け、事前準備ではpushやCI実行をしない。

## 誰が何をするか

| 担当 | 作業 |
|---|---|
| YOSHI | microCMSキー再発行、Xserverログイン準備、DNS切替の承認 |
| ChatGPT/Codex | ステージ検証、デプロイ用ファイルの点検、Xserver側公開とテスト |
| ツバキ亭側 | 新HPの内容確認、切替後のメール送受信確認 |
| ダイゴさん | ロリポップのメール環境を維持 |
