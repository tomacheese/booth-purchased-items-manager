# Verify VPM Packages

VPMリポジトリの全パッケージを検証し、パッケージ名の一貫性、package.jsonの完全性、空のディレクトリの有無をチェックします。

## 実行内容
1. 全パッケージディレクトリをスキャン
2. package.jsonの存在確認
3. パッケージ名とフォルダ名の一貫性チェック
4. 空のディレクトリ検出
5. バージョン形式の検証
6. displayNameの品質チェック

```bash
pnpm exec tsx verify-packages.ts
```