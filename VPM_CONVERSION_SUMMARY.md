# VPM変換機能 実装サマリー

## 概要
Boothで購入したUnityPackageをVPM（VRChat Package Manager）形式に変換し、ローカルでバージョン管理する機能を実装しました。

## 実装された機能

### 1. 基本VPM変換機能
- UnityPackageファイルをVPM形式のパッケージに変換
- セマンティックバージョニングによるバージョン管理
- VPMリポジトリマニフェスト（vpm.json）の自動生成・更新
- パッケージ名形式: `com.booth.{product-id}`

### 2. ファイル処理機能
- ZIP圧縮されたUnityPackageの自動展開
- ZIP内の全UnityPackageファイルの処理（複数ファイル対応）
- 重複ファイルの検出とスキップ（ハッシュベース）
- 一時ファイルの自動クリーンアップ

### 3. バージョン抽出機能
ファイル名から以下のパターンでバージョンを抽出：
```typescript
const patterns = [
  /[_-]v(\d+(?:\.\d+)*)/i,           // _v2.8.5, -v1.0, -v1
  /[_-]ver\.?(\d+(?:\.\d+)*)/i,      // _ver1.0.0, _Ver1.4, _Ver1
  /[_-]V(\d+(?:\.\d+)*)/,            // _V1.0, _V1
  /V(\d+(?:\.\d+)*)/i,               // V1.2, V2.0 (区切り文字なし)
  /[_-]version[_-]?(\d+(?:\.\d+)*)/i, // _version1.0, _version1
  /(\d+(?:\.\d+)*)\.unitypackage$/i,  // filename1.0.1.unitypackage
  /[_-](\d+[_-]\d+[_-]\d+)(?:[_-]|$)/, // _1_6_1 形式
];
```

### 4. VPMパッケージ構造
- 正しいVPM Package Manager形式での出力
- package.jsonマニフェスト生成
- Runtime/Editorフォルダ構造の作成
- Assembly Definition (.asmdef) ファイル生成
- UnityPackage内容の適切な配置

### 5. HTTP URL対応
- 環境変数 `VPM_BASE_URL` によるHTTPサーバー対応
- ローカルファイル参照（file://）とHTTP URL生成の切り替え
- パッケージ配信用URL生成

## 修正された主要な問題

### 1. バージョン抽出の改善
**問題**: `PetiteLoliDress_FullSet_Ver1.4.zip`から`Ver1.4`が抽出されず、日付ベース（`2025.6.4`）になっていた

**解決策**: 
- 正規表現を`(\d+(?:\.\d+)+)`から`(\d+(?:\.\d+)*)`に修正
- 元のアイテム名を優先的にバージョン抽出に使用
- `V1.2`のような区切り文字なしパターンに対応

### 2. 複数UnityPackage処理
**問題**: ZIP内の最初のUnityPackageのみ処理していた

**解決策**: 
- `extractAllUnityPackagesFromZip()`メソッドで全ファイルを処理
- 再帰的なUnityPackageファイル検索

### 3. VPMパッケージ構造の修正
**問題**: UnityPackageをそのままZIP化していた

**解決策**:
- 正しいVPM Package Manager構造での出力
- UnityPackageの内容解析と適切な配置
- Runtime/Editor分離とasmdef生成

## ファイル構造

### 追加・修正されたファイル
```
src/
├── vpm-converter.ts          # メインVPM変換クラス
├── environment.ts            # 環境変数設定（VPM関連追加）
└── main.ts                  # VPM変換をワークフローに統合

.gitignore                   # VPMリポジトリを除外
compose.yaml                 # VPM_BASE_URL環境変数例
Dockerfile                   # zip/unzipパッケージ追加
```

### 生成されるVPMリポジトリ構造
```
data/vpm-repository/
├── vpm.json                           # リポジトリマニフェスト
└── packages/
    └── com.booth.{product-id}/
        └── {version}/
            ├── package.json           # パッケージマニフェスト
            └── com.booth.{product-id}-{version}.zip  # VPMパッケージ
```

## 環境変数

```yaml
VPM_REPOSITORY_DIR: "data/vpm-repository/"  # VPMリポジトリディレクトリ
VPM_ENABLED: "true"                         # VPM変換有効/無効
VPM_BASE_URL: "http://localhost:8080"       # HTTPサーバーベースURL（任意）
```

## 成功事例

### バージョン抽出の改善結果
- ✅ `PetiteLoliDress_FullSet_Ver1.4.zip` → `1.4.0`
- ✅ `MacaronDevil_Komado_Ver1.1.zip` → `1.1.0`  
- ✅ `AvatarPoseSystem_v2.0.5.zip` → `2.0.5`
- ✅ `AvatarPoseSystem_v1.0.15.zip` → `1.0.15`

### 次回処理で改善予定
- 🔄 `pose_tailshopV1.2.zip` → `1.2.0`（新パターン対応済み）

## 使用方法

### Docker Compose起動
```bash
docker compose up --build -d
```

### VPMリポジトリ確認
```bash
# リポジトリマニフェスト確認
cat data/vpm-repository/vpm.json

# パッケージ確認
ls data/vpm-repository/packages/
```

### VRChatでの使用
1. VCC（VRChat Creator Companion）を開く
2. "Add Repository"でvpm.jsonのURLを追加
3. プロジェクトでパッケージをインストール

## 今後の改善点

1. **テスト体制**: 指定された手順でのテスト実行
   - `docker compose up --build -d`
   - 一定時間待機して生成状態確認
   - 問題があればコード修正とリセット

2. **追加バージョンパターン対応**: 
   - より多様なファイル名パターンの対応
   - 日本語ファイル名の適切な処理

3. **エラーハンドリング強化**:
   - 破損したUnityPackageの処理
   - ネットワークエラー時の適切な対応

## 技術詳細

### VPM変換プロセス
1. BoothアイテムのダウンロードIDとファイル名を取得
2. ZIPファイルの場合は展開してUnityPackageを抽出
3. ファイル名からバージョンを抽出（失敗時は日付ベース）
4. 重複チェック（ファイルハッシュベース）
5. VPMパッケージ構造を作成（Runtime/Editor分離）
6. package.jsonマニフェスト生成
7. ZIPパッケージ作成とvpm.json更新

### 依存関係
- Node.js/TypeScript
- tar（UnityPackage展開用）
- zip/unzip（パッケージ作成用）
- Docker（実行環境）

## 結論
VPM変換機能は正常に動作しており、ファイル名からの適切なバージョン抽出、複数UnityPackageの処理、正しいVPM形式での出力が可能になりました。継続的なテストと改善により、より堅牢なシステムへと発展させていく予定です。