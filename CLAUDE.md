# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際の作業方針とルールを示します。

## プロジェクト概要

- 目的: BOOTH で購入した商品や無料配布商品を管理・ダウンロードし、VPM リポジトリへ変換する
- 主な機能:
  - 購入済み・ギフト・ウィッシュリストからの商品取得（Puppeteer によるスクレイピング）
  - 商品ファイルの自動ダウンロード
  - UnityPackage の VPM リポジトリ形式への変換
  - Discord Webhook による通知

## 重要ルール

- 会話は日本語で行う。
- PR とコミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。
  - `<type>(<scope>): <description>` 形式
  - `<description>` は英語で記載する
- コメントは日本語で記載する。
- エラーメッセージは原則英語で記載する。
- 日本語と英数字の間には半角スペースを挿入する。

## 判断記録のルール

- 判断内容の要約
- 検討した代替案
- 採用しなかった案とその理由
- 前提条件・仮定・不確実性
- 他エージェントによるレビュー可否

## 環境のルール

- ブランチ命名は [Conventional Branch](https://conventional-branch.github.io) に従う。
  - `<type>/<description>` 形式
  - `<type>` は短縮形（feat, fix）を使用
- GitHub リポジトリの調査が必要な場合は、テンポラリディレクトリに clone して行う。
- Renovate が作成した既存の PR に対して、追加コミットや更新を行ってはならない。

## コード改修時のルール

- 既存のエラーメッセージで先頭に絵文字がある場合は、全体でエラーメッセージに絵文字を設定する。
- TypeScript において、`skipLibCheck` を有効にして回避することは禁止。
- 関数やインターフェースには、日本語で docstring (JSDoc) を記載・更新する。

## 相談ルール

- **Codex CLI**: 実装レビュー、局所設計、整合性確認に使用。
- **Gemini CLI**: 外部仕様、最新情報の確認に使用。
- 指摘への対応: コードレビュー等の指摘は黙殺せず、必ず対応または返答する。

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

# 特定のテストファイル実行
pnpm test src/booth.test.ts

# リンター実行（lint:prettier, lint:eslint, lint:tsc）
pnpm lint

# 自動修正実行
pnpm fix
```

## アーキテクチャと主要ファイル

- **コアアーキテクチャ**:
  1. `booth.ts`: Puppeteer を使用したスクレイピング
  2. `main.ts`: 全体のオーケストレーション
  3. `vpm-converter.ts`: UnityPackage から VPM 形式への変換
  4. `pagecache.ts`: キャッシュ層
  5. `environment.ts`: 環境変数・設定管理
- **データフロー**:
  - Booth から商品情報を取得 → ダウンロード → 抽出・分析 → VPM マニフェスト生成 → リポジトリ構造作成

## 実装パターン

- 認証情報は `data/cookies.json` に永続化される。
- VPM リポジトリの自動再構築ロジックが `vpm-converter.ts` に含まれている。

## テスト

- Jest を使用。ファイルシステム操作を伴うため `--runInBand` を必須とする。
- 新機能やバグ修正時には、対応するテストファイル（`*.test.ts`）を作成・更新する。

## ドキュメント更新ルール

- 以下のファイルを変更に合わせて更新する:
  - `README.md`
  - `.github/copilot-instructions.md`
  - `GEMINI.md`
  - `AGENTS.md`

## 作業チェックリスト

### 新規改修時

1. プロジェクトを詳細に探索し理解する
2. 作業ブランチが適切であることを確認する
3. 最新のリモートブランチに基づいた新規ブランチであることを確認する
4. 不要となったブランチは削除されていることを確認する
5. `pnpm install` で依存関係をインストールする

### コミット・プッシュ前

1. Conventional Commits に従っていることを確認する
2. センシティブな情報が含まれていないことを確認する
3. `pnpm lint` でエラーがないことを確認する
