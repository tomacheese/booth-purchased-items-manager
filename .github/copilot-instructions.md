# GitHub Copilot Instructions

## プロジェクト概要

- 目的: BOOTH で購入した商品や無料配布商品を管理・ダウンロードし、VPM リポジトリへ変換する
- 主な機能:
  - 購入済み・ギフト・ウィッシュリストからの商品取得（Puppeteer によるスクレイピング）
  - 商品ファイルの自動ダウンロード
  - UnityPackage の VPM リポジトリ形式への変換
  - Discord Webhook による通知
- 対象ユーザー: BOOTH を利用する VRChat ユーザー、開発者

## 共通ルール

- 会話は日本語で行う。
- PR とコミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。
  - `<type>(<scope>): <description>` 形式
  - `<description>` は英語で記載
- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) に従う。
  - `<type>/<description>` 形式
  - `<type>` は短縮形（feat, fix）を使用
- 日本語と英数字の間には半角スペースを入れる。

## 技術スタック

- 言語: TypeScript
- 実行環境: Node.js
- パッケージマネージャー: pnpm
- 主要ライブラリ: Puppeteer-core, Axios, Jest, ESLint, Prettier, tsx

## コーディング規約

- フォーマット: Prettier (`.prettierrc.yml` に準拠)
- リンター: ESLint (`eslint.config.mjs` に準拠)
- TypeScript: `skipLibCheck` の有効化による回避は禁止
- ドキュメント: 関数・インターフェースには JSDoc 形式の docstring を日本語で記載する

## 開発コマンド

```bash
# 依存関係のインストール
pnpm install

# 開発（ウォッチモード）
pnpm dev

# 実行
pnpm start

# テスト実行
pnpm test

# リンター実行
pnpm lint

# 自動修正実行
pnpm fix
```

## テスト方針

- テストフレームワーク: Jest (ts-jest)
- 方針:
  - 新機能追加やバグ修正時には必ずテストを追加・更新する
  - ファイルシステム操作を伴うため、`--runInBand` で逐次実行する

## セキュリティ / 機密情報

- `.env` や認証情報（`BOOTH_EMAIL`, `BOOTH_PASSWORD` 等）をコミットしない。
- ログにパスワードやクッキーなどの機密情報を出力しない。

## ドキュメント更新

- 以下のファイルを変更に合わせて更新する:
  - `README.md`: ユーザー向けドキュメント
  - `CLAUDE.md`: Claude Code 向けガイド
  - `GEMINI.md`: Gemini CLI 向けガイド
  - `AGENTS.md`: AI エージェント全般向けガイド

## リポジトリ固有

- VPM 変換ロジックは `src/vpm-converter.ts` に集約されている。
- Booth のスクレイピングは `src/booth.ts` で行われる。
- `data/cookies.json` にセッション情報が保存されるため、取り扱いに注意する。
