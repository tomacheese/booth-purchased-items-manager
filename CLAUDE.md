# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Booth Purchased Items Manager

Boothで購入したアイテムを自動的にVPMリポジトリに変換・管理するシステムです。

## コアアーキテクチャ

TypeScript/Node.jsアプリケーションで、以下のパイプラインを実行します：

1. **Boothスクレイピング** (`booth.ts`) - Puppeteerを使用して購入済みアイテム、ギフト、ウィッシュリストアイテムを取得
2. **アイテム処理** (`main.ts`) - 取得、ダウンロード、変換を調整
3. **VPM変換** (`vpm-converter.ts`) - UnityPackageをVRChat Package Manager形式に変換
4. **キャッシュ層** (`pagecache.ts`) - 開発時の重複API呼び出しを防止
5. **環境管理** (`environment.ts`) - 設定の一元管理

### 主要コンポーネント

- **BoothParser**: HTMLページから商品情報を抽出
- **BoothRequest**: Booth認証とHTTPリクエストを処理
- **VpmConverter**: UnityPackageからVPM形式への変換ロジック
- **PageCache**: HTMLレスポンスのファイルベースキャッシュ

### データフロー

1. Boothから購入済みアイテム、ギフト、ウィッシュリストアイテムを取得
2. 各アイテムのUnityPackageファイルをダウンロード
3. パッケージ内容を抽出・分析
4. VPM互換のpackage.jsonマニフェストを生成
5. 適切なファイルハッシュ付きでバージョン管理されたリポジトリ構造を作成

## 開発コマンド

```bash
# 依存関係のインストール
pnpm install

# 開発
pnpm dev

# テスト
pnpm test

# Lint
pnpm lint
```

## Docker環境

```bash
# 完全リビルドと実行
docker compose up --build

# バックグラウンド実行
docker compose up --build -d

# VPMリポジトリをクリーンアップしてリビルド
docker compose run --rm app rm -rf /app/data/vpm-repository
docker compose up --build

# ログ監視
docker logs booth-purchased-items-manager-app-1 --tail 20 -f
```

## VPMパッケージ検証

品質保証のためのカスタム検証ツールが含まれています：

### /project:verify-packages

すべてのVPMパッケージの一貫性問題、空ディレクトリ、不正なメタデータを検証します。

### /project:rebuild-and-verify  

VPMリポジトリを完全に再構築し、包括的な検証を実行します。

### /project:test-packages [パッケージ名]

特定のパッケージのVPM形式コンプライアンスと整合性をテストします。

## テスト戦略

- 個別コンポーネントの単体テスト (booth.test.ts, vpm-converter.test.ts)
- メインワークフローの統合テスト (main.test.ts)
- 環境検証テスト (environment.test.ts)
- ファイルシステム操作のため`--runInBand`でのJest逐次実行

## 重要な環境変数

異なるデプロイメントシナリオでの重要な設定：

- `BOOTH_EMAIL`/`BOOTH_PASSWORD` - 認証情報
- `VPM_CREATE_FALLBACK_PACKAGES` - フォールバックパッケージ作成の制御
- `VPM_ENABLED` - VPM変換機能の切り替え
- `WISHLIST_IDS` - 無料アイテム自動検出用のカンマ区切りウィッシュリストID
- `IS_HEADLESS` - 開発時のブラウザ表示制御

## よくある問題

**パッケージ識別**: VPMコンバーターは関連パッケージの識別とファイル名競合防止のための高度なロジックを使用します。パターンマッチングと識別ルールは`vpm-converter.ts`を確認してください。

**空のパッケージ**: UnityPackage抽出が失敗した場合、`VPM_CREATE_FALLBACK_PACKAGES=true`でフォールバックパッケージを作成できます。

**認証**: 実行間でBoothログインセッションを維持するため、`data/cookies.json`に永続クッキーストレージを使用します。

## VPMリポジトリ自動再構築

VPMコンバーターは、構成変更を自動検出してリポジトリを再構築します：

### 自動再構築のトリガー

- **コンバーターバージョン更新**: `CONVERTER_VERSION`の変更時
- **設定変更**: VPM関連環境変数の変更時
- **長期未更新**: 30日以上更新されていない場合
- **強制再構築**: `VPM_FORCE_REBUILD=true`指定時

### 再構築プロセス

1. 既存リポジトリのバックアップ作成（`.backup-{timestamp}`形式）
2. 既存リポジトリの削除
3. 新しいリポジトリの再生成
4. メタデータファイル（`.metadata.json`）の更新

### 関連環境変数

- `VPM_FORCE_REBUILD`: 強制的にリポジトリを再構築（デフォルト: false）
- `VPM_CREATE_FALLBACK_PACKAGES`: フォールバックパッケージの作成（デフォルト: false）

### 使用例

```bash
# 強制再構築
VPM_FORCE_REBUILD=true pnpm start

# フォールバックパッケージ有効化で再構築
VPM_CREATE_FALLBACK_PACKAGES=true VPM_FORCE_REBUILD=true pnpm start
```

## 開発ワークフロー

issue対応や機能開発を行う際は、以下の手順に従ってください：

### ブランチ作成と作業手順

1. **ブランチ作成**: `origin/master`をベースとしたno-trackブランチを作成

   ```bash
   git checkout -b issue-XXX-description --no-track origin/master
   ```

2. **開発作業**: 該当ブランチで変更を実施

3. **品質チェック**: ローカルで品質チェックを実行

   ```bash
   pnpm lint    # リンティング、フォーマット、型チェック
   pnpm test    # 全テスト実行
   ```

4. **コミット・プッシュ**: 変更をコミットしてリモートにプッシュ

   ```bash
   git add .
   git commit -m "適切なコミットメッセージ"
   git push -u origin issue-XXX-description
   ```

5. **PR作成**: GitHub上でプルリクエストを作成

6. **コードレビュー対応**: Copilotによるレビューに対応
   - 通常のコメント
   - コードレビューサジェスト
   - 両方を参照して必要に応じて修正

7. **CI対応**: CIがパスするまで修正を継続

### 重要な注意点

- 品質チェック（lint/test）は必ずローカルで事前実行
- CIは必ずパスさせる
- Copilotのサジェストは慎重に検討して適用
