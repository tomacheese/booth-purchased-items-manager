# GitHub Copilot Instructions for Booth Purchased Items Manager

## プロジェクト概要

このプロジェクトは、BOOTH で購入したアイテムを自動的に VPM（VRChat Package Manager）リポジトリに変換・管理する
TypeScript/Node.js アプリケーションです。

### 主要機能

- BOOTH からの購入済みアイテム、ギフト、ウィッシュリストアイテムの取得
- UnityPackage から VPM 形式への自動変換
- Discord Webhook による新着通知
- ファイルベースのキャッシュシステム
- 環境設定の一元管理

## アーキテクチャ

### コアコンポーネント

- **booth.ts**: Puppeteer を使用した BOOTH スクレイピング
- **main.ts**: メインワークフローの調整
- **vpm-converter.ts**: UnityPackage → VPM 変換ロジック
- **pagecache.ts**: 開発時の HTTP レスポンスキャッシュ
- **environment.ts**: 環境変数とディレクトリ設定の管理

### データフロー

1. BOOTH から商品情報を取得
2. UnityPackage ファイルをダウンロード
3. パッケージ内容を抽出・分析
4. VPM 互換の package.json マニフェストを生成
5. バージョン管理されたリポジトリ構造を作成

## コーディング規約

### TypeScript 設定

- 厳格モード有効（strict: true）
- ES2020 ターゲット
- CommonJS 形式
- 未使用変数・パラメータの検出有効
- パスエイリアス: `@/*` → `src/*`

### ESLint 設定

- `@book000/eslint-config` を使用
- 自動修正: `pnpm fix`
- チェック: `pnpm lint:eslint`

### Prettier 設定

- `.prettierrc.yml` による統一フォーマット
- 自動修正: `pnpm fix:prettier`
- チェック: `pnpm lint:prettier`

## 開発ワークフロー

### パッケージ管理

- **pnpm** を使用（npm/yarn は使用しない）
- `packageManager` フィールドでバージョン指定
- `preinstall` スクリプトで pnpm 強制

### コマンド

```bash
# 開発（ホットリロード）
pnpm dev

# 本番実行
pnpm start

# 全品質チェック（ESLint + Prettier + TypeScript）
pnpm lint

# 自動修正
pnpm fix

# テスト実行
pnpm test

# 特定テストファイル
pnpm test src/booth.test.ts
```

### テスト戦略

- **Jest** を使用（--runInBand 指定必須）
- ファイルシステム操作のため逐次実行
- カバレッジ: 各ファイル 80% 以上を目指す
- モック: `__mocks__` ディレクトリ
- テストファイル: `*.test.ts` パターン

## 重要な開発ルール

### コミュニケーション

- **PR タイトル**: 英語 + Conventional Commits 仕様
- **PR 本文**: 日本語
- **レビューコメント**: 日本語
- **issue 対応**: 日本語
- **commit message**: Conventional Commits 仕様

### Conventional Commits 例

```text
feat: add new wishlist monitoring feature
fix: resolve VPM package conversion error
docs: update README with new environment variables
test: add unit tests for booth parser
refactor: improve error handling in main workflow
```

## 環境変数

### 必須設定

- `BOOTH_EMAIL` / `BOOTH_PASSWORD`: BOOTH 認証情報
- `VPM_ENABLED`: VPM 変換機能の有効化（デフォルト: true）
- `WISHLIST_IDS`: 監視対象ウィッシュリスト ID（カンマ区切り）

### パス設定

- `PRODUCTS_PATH`: 商品情報保存先（デフォルト: data/products.json）
- `VPM_REPOSITORY_DIR`: VPM リポジトリディレクトリ（デフォルト: data/vpm-repository/）
- `CACHE_DIR`: キャッシュディレクトリ（デフォルト: data/cache/）

### 開発用

- `IS_HEADLESS`: ヘッドレスモード（デフォルト: false）
- `VPM_FORCE_REBUILD`: 強制リビルド（デフォルト: false）
- `VPM_CREATE_FALLBACK_PACKAGES`: フォールバック作成（デフォルト: false）

## 共通パターン

### エラーハンドリング

```typescript
try {
  const result = await someAsyncOperation()
  return result
} catch (error) {
  Logger.error('Operation failed:', error)
  throw new Error(`Failed to perform operation: ${error.message}`)
}
```

### 環境変数取得

```typescript
import { Environment } from './environment'

const env = new Environment()
const isHeadless = env.getBoolean('IS_HEADLESS')
const productsPath = env.getFile('PRODUCTS_PATH')
```

### キャッシュ利用

```typescript
const html = await pageCache.loadOrFetch(
  'cache-key',
  'sub-key',
  maxAgeHours,
  async () => {
    // 実際の HTTP リクエスト
    return await fetchData()
  }
)
```

## ファイル組織

### ディレクトリ構造

```text
src/
├── main.ts              # メインエントリーポイント
├── booth.ts             # BOOTH API/スクレイピング
├── vpm-converter.ts     # VPM 変換ロジック
├── pagecache.ts         # HTTP キャッシュ
├── environment.ts       # 環境設定
├── generate-linked-list.ts # リンク生成
└── *.test.ts           # テストファイル

__mocks__/               # Jest モック
data/                   # 実行時データ（.gitignore 対象）
.github/                # GitHub Actions & 設定
```

### 命名規約

- ファイル名: kebab-case（例: `vpm-converter.ts`）
- クラス名: PascalCase（例: `BoothParser`）
- 関数・変数名: camelCase（例: `fetchPurchased`）
- 定数: SCREAMING_SNAKE_CASE（例: `VPM_ENABLED`）

## Docker 環境

### 基本操作

```bash
# 完全リビルド実行
docker compose up --build

# VPM リポジトリクリーンアップ後実行
docker compose run --rm app rm -rf /app/data/vpm-repository
docker compose up --build

# ログ監視
docker logs booth-purchased-items-manager-app-1 --tail 20 -f
```

## CI/CD

### GitHub Actions

- **nodejs-ci-pnpm.yml**: メイン CI（lint, test, build）
- **add-reviewer.yml**: 自動レビュアー追加
- **docker.yml**: Docker イメージビルド

### ブランチ保護

- `main`/`master` ブランチで CI 必須
- pull_request 時に CI 実行
- merge_group 対応

## よくある作業

### 新機能追加

1. 関連するテストファイルを確認
2. 既存パターンに従った実装
3. 単体テスト追加
4. 統合テストでの動作確認
5. 環境変数が必要な場合は `environment.ts` に追加

### バグ修正

1. 再現テストケース作成
2. 最小限の修正実装
3. 関連テストの実行確認
4. 回帰テスト実行

### 依存関係更新

1. `pnpm update` 実行
2. テスト全体の実行確認
3. 破壊的変更がある場合は対応実装

## 注意事項

### パフォーマンス

- Puppeteer のメモリ使用量に注意
- 大量ファイル処理時はストリーム処理を検討
- キャッシュ機能を積極活用

### セキュリティ

- 認証情報は環境変数で管理
- `.env` ファイルは `.gitignore` 対象
- Discord Webhook URL の取り扱い注意

### デバッグ

- `IS_HEADLESS=false` でブラウザ表示可能
- PageCache で HTTP リクエスト削減
- Logger クラスでログ出力統一

この指示に従って、プロジェクトの一貫性を保ちながら効率的な開発を行ってください。
