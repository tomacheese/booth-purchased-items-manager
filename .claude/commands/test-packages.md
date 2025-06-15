# Test VPM Package Validity

特定のパッケージのVPM形式での正常性をテストします。

## テスト内容
- UnityPackageとpackage.jsonの整合性
- 依存関係の検証
- バージョン管理の確認
- ファイル構造の検証
- ZIPアーカイブの完全性

## 使用方法
引数にパッケージ名を指定: $ARGUMENTS

例: `/project:test-packages com.booth.example.package`

## 実行コマンド
```bash
# 特定のパッケージをテスト
find data/vpm-repository/packages/$ARGUMENTS -name "package.json" -exec cat {} \;

# ZIPファイルの検証
find data/vpm-repository/packages/$ARGUMENTS -name "*.zip" -exec unzip -t {} \;
```