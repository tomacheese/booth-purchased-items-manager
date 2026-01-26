# GEMINI.md

このファイルは、Gemini CLI がこのリポジトリで作業する際のコンテキストと方針を定義します。

## 目的

Gemini CLI がプロジェクトの文脈を正確に理解し、適切な提案やコード改修を行えるようにします。

## 出力スタイル

- 言語: 日本語
- トーン: プロフェッショナルかつ簡潔（CLI 環境に適した形式）
- 形式: GitHub Flavored Markdown

## 共通ルール

- 会話は日本語で行う。
- PR とコミットは [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) に従う。
  - `<type>(<scope>): <description>` 形式
  - `<description>` は英語で記載
- 日本語と英数字の間には半角スペースを挿入する。

## 判断記録のルール

作業中の重要な意思決定については、以下の情報を明示してください。

- 判断内容の要約
- 検討した代替案
- 採用しなかった案とその理由
- 前提条件・仮定・不確実性
- 他エージェントによるレビュー可否

## プロジェクト概要

- **名称**: booth-purchased-items-manager
- **概要**: BOOTH の購入済み商品を自動取得・ダウンロードし、VPM (VRChat Package Manager) リポジトリ形式に変換・管理するツール。
- **主要機能**:
  - Puppeteer による BOOTH スクレイピング（購入済み、ギフト、ウィッシュリスト）
  - 自動ダウンロードと UnityPackage の解析
  - VPM リポジトリの生成とバージョン管理
  - Discord 通知機能

## コーディング規約

- **フォーマット**: Prettier
- **命名規則**: TypeScript の標準的な命名規則（camelCase, PascalCase）
- **コメント**: 日本語で記載
- **エラーメッセージ**: 英語で記載
- **TypeScript**: `skipLibCheck` による回避禁止

## 開発コマンド

```bash
# 依存関係インストール
pnpm install

# 開発
pnpm dev

# 実行
pnpm start

# テスト
pnpm test

# リンター
pnpm lint

# 自動修正
pnpm fix
```

## 注意事項

- 認証情報（`BOOTH_EMAIL`, `BOOTH_PASSWORD` 等）を絶対にコミットしない。
- `data/cookies.json` に保存されるセッション情報の取り扱いに注意する。
- 既存のアーキテクチャ（`src/vpm-converter.ts`, `src/booth.ts` 等）を尊重し、整合性を保つ。

## ドキュメント更新

次のファイルや設定に影響する変更を行った場合は、内容の更新を検討すること。

- `README.md`
- `CLAUDE.md`
- `GEMINI.md`
- `AGENTS.md`
- `.github/copilot-instructions.md`
- CI 設定（`.github/workflows/*.yml`）
- Docker 関連ファイル（`Dockerfile`, `compose.yaml` など）

## リポジトリ固有

- VPM 変換は非常に複雑なロジックを伴うため、 `src/vpm-converter.ts` の変更時は特に慎重に検討すること。
- テストは `pnpm test` で実行可能。ファイル操作が含まれるため、逐次実行の設定を維持すること。
