# GitHub Copilot Instructions for Booth Purchased Items Manager

## プロジェクト概要

このプロジェクトは、BOOTHで購入したアイテムを自動的にVPM（VRChat Package Manager）リポジトリに変換・管理するTypeScript/Node.jsアプリケーションです。

### 主要機能
- BOOTHからの購入済みアイテム、ギフト、ウィッシュリストアイテムの取得
- UnityPackageからVPM形式への自動変換
- Discord Webhookによる新着通知
- ファイルベースのキャッシュシステム
- 環境設定の一元管理

## アーキテクチャ

### コアコンポーネント
- **booth.ts**: Puppeteerを使用したBOOTHスクレイピング
- **main.ts**: メインワークフローの調整
- **vpm-converter.ts**: UnityPackage → VPM変換ロジック
- **pagecache.ts**: 開発時のHTTPレスポンスキャッシュ
- **environment.ts**: 環境変数とディレクトリ設定の管理

### データフロー
1. BOOTHから商品情報を取得
2. UnityPackageファイルをダウンロード
3. パッケージ内容を抽出・分析
4. VPM互換のpackage.jsonマニフェストを生成
5. バージョン管理されたリポジトリ構造を作成

## コーディング規約

### TypeScript設定
- 厳格モード有効（strict: true）
- ES2020ターゲット
- CommonJS形式
- 未使用変数・パラメータの検出有効
- パスエイリアス: `@/*` → `src/*`

### ESLint設定
- `@book000/eslint-config`を使用
- 自動修正: `pnpm fix`
- チェック: `pnpm lint:eslint`

### Prettier設定
- `.prettierrc.yml`による統一フォーマット
- 自動修正: `pnpm fix:prettier`
- チェック: `pnpm lint:prettier`

## 開発ワークフロー

### パッケージ管理
- **pnpm**を使用（npm/yarnは使用しない）
- `packageManager`フィールドでバージョン指定
- `preinstall`スクリプトでpnpm強制

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
- **Jest**を使用（--runInBand指定必須）
- ファイルシステム操作のため逐次実行
- カバレッジ: 92 passed, 7 skipped
- モック: `__mocks__`ディレクトリ
- テストファイル: `*.test.ts`パターン

## 重要な開発ルール

### コミュニケーション
- **PRタイトル**: 英語 + Conventional Commits仕様
- **PR本文**: 日本語
- **レビューコメント**: 日本語
- **issue対応**: 日本語
- **commit message**: Conventional Commits仕様

### Conventional Commits例
```
feat: add new wishlist monitoring feature
fix: resolve VPM package conversion error
docs: update README with new environment variables
test: add unit tests for booth parser
refactor: improve error handling in main workflow
```

### Git ワークフロー
1. `origin/master`ベースのno-trackブランチ作成
2. 機能開発・修正実装
3. `pnpm lint && pnpm test`でローカル検証
4. commit & push
5. PR作成（タイトル英語、本文日本語）
6. CI通過まで修正継続

## 環境変数

### 必須設定
- `BOOTH_EMAIL` / `BOOTH_PASSWORD`: BOOTH認証情報
- `VPM_ENABLED`: VPM変換機能の有効化（デフォルト: true）
- `WISHLIST_IDS`: 監視対象ウィッシュリストID（カンマ区切り）

### パス設定
- `PRODUCTS_PATH`: 商品情報保存先（デフォルト: data/products.json）
- `VPM_REPOSITORY_DIR`: VPMリポジトリディレクトリ（デフォルト: data/vpm-repository/）
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
    // 実際のHTTPリクエスト
    return await fetchData()
  }
)
```

## ファイル組織

### ディレクトリ構造
```
src/
├── main.ts              # メインエントリーポイント
├── booth.ts             # BOOTH API/スクレイピング
├── vpm-converter.ts     # VPM変換ロジック
├── pagecache.ts         # HTTPキャッシュ
├── environment.ts       # 環境設定
├── generate-linked-list.ts # リンク生成
└── *.test.ts           # テストファイル

__mocks__/               # Jestモック
data/                   # 実行時データ（.gitignore対象）
.github/                # GitHub Actions & 設定
```

### 命名規約
- ファイル名: kebab-case（例: `vpm-converter.ts`）
- クラス名: PascalCase（例: `BoothParser`）
- 関数・変数名: camelCase（例: `fetchPurchased`）
- 定数: SCREAMING_SNAKE_CASE（例: `VPM_ENABLED`）

## Docker環境

### 基本操作
```bash
# 完全リビルド実行
docker compose up --build

# VPMリポジトリクリーンアップ後実行
docker compose run --rm app rm -rf /app/data/vpm-repository
docker compose up --build

# ログ監視
docker logs booth-purchased-items-manager-app-1 --tail 20 -f
```

## CI/CD

### GitHub Actions
- **nodejs-ci-pnpm.yml**: メインCI（lint, test, build）
- **add-reviewer.yml**: 自動レビュアー追加
- **docker.yml**: Docker イメージビルド

### ブランチ保護
- `main`/`master`ブランチでCI必須
- pull_request時にCI実行
- merge_group対応

## よくある作業

### 新機能追加
1. 関連するテストファイルを確認
2. 既存パターンに従った実装
3. 単体テスト追加
4. 統合テストでの動作確認
5. 環境変数が必要な場合は`environment.ts`に追加

### バグ修正
1. 再現テストケース作成
2. 最小限の修正実装
3. 関連テストの実行確認
4. 回帰テスト実行

### 依存関係更新
1. `pnpm update`実行
2. テスト全体の実行確認
3. 破壊的変更がある場合は対応実装

## 注意事項

### パフォーマンス
- Puppeteerのメモリ使用量に注意
- 大量ファイル処理時はストリーム処理を検討
- キャッシュ機能を積極活用

### セキュリティ
- 認証情報は環境変数で管理
- `.env`ファイルは`.gitignore`対象
- Discord Webhook URLの取り扱い注意

### デバッグ
- `IS_HEADLESS=false`でブラウザ表示可能
- PageCacheでHTTPリクエスト削減
- Loggerクラスでログ出力統一

この指示に従って、プロジェクトの一貫性を保ちながら効率的な開発を行ってください。