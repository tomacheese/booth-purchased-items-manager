# VPM変換機能 テスト手順

## 現在の状況
- VPMリポジトリディレクトリが部分的に生成されている
- vpm.jsonファイルが存在しない
- パッケージディレクトリが不完全な状態

## テスト手順

### 1. Docker Compose起動
```bash
# プロジェクトのルートディレクトリに移動
cd path/to/booth-purchased-items-manager
docker compose up --build -d
```

### 2. 一定時間待機
- 初回: 5分間待機
- 問題なければ10分間に延長して再確認

### 3. 生成状態確認
以下の項目をチェック：

#### 必須ファイル確認
```bash
# VPMリポジトリマニフェスト存在確認
ls -la data/vpm-repository/vpm.json

# パッケージディレクトリ確認
ls -la data/vpm-repository/packages/

# 生成されたパッケージ確認
find data/vpm-repository/packages/ -name "*.zip" | head -5
```

#### vpm.json内容確認
以下の要素が正しく生成されているかチェック：
- リポジトリメタデータ（name, id, url）
- packages セクション
- 各パッケージのバージョン情報
- 正しいバージョン番号（ファイル名から抽出されたもの）

#### 期待されるバージョン抽出結果
- `PetiteLoliDress_FullSet_Ver1.4.zip` → `1.4.0`
- `MacaronDevil_Komado_Ver1.1.zip` → `1.1.0`
- `pose_tailshopV1.2.zip` → `1.2.0`
- `AvatarPoseSystem_v2.0.5.zip` → `2.0.5`

### 4. 成功条件
以下がすべて満たされた場合は終了：
- vpm.jsonファイルが存在し、有効なJSONである
- 複数のパッケージが正しく処理されている
- バージョン抽出が期待通りに動作している
- パッケージZIPファイルが適切に生成されている
- ログにエラーがない

### 5. 問題がある場合のリセット手順
```bash
# コンテナ停止
docker compose down

# VPMリポジトリ削除
rm -rf data/vpm-repository/

# 必要に応じてコード修正を実行
# その後、手順1に戻る
```

## よくある問題と対処

### 問題1: vpm.jsonが生成されない
**原因**: VPM変換処理が開始されていない、または早期に失敗している
**対処**: ログを確認し、VPM_ENABLEDの設定とVPM変換ロジックをチェック

### 問題2: バージョン抽出が正しくない
**原因**: 正規表現パターンがファイル名にマッチしていない
**対処**: extractVersionFromFilename メソッドのパターンを見直し

### 問題3: パッケージが部分的にしか生成されない
**原因**: UnityPackage処理中のエラー、または重複チェック問題
**対処**: エラーハンドリングと重複検出ロジックを確認

### 問題4: ZIP内の複数UnityPackageが処理されない
**原因**: extractAllUnityPackagesFromZip メソッドの問題
**対処**: ZIP展開と再帰的検索ロジックを確認

## 現在の修正が必要な箇所

### コード修正候補
1. **VPM変換プロセスの初期化問題**
   - VpmConverter のコンストラクタ
   - リポジトリディレクトリの作成タイミング

2. **エラーハンドリング強化**
   - try-catch ブロックの見直し
   - ログ出力の詳細化

3. **バージョン抽出パターンの改善**
   - より多様なファイル名パターンに対応
   - フォールバック処理の改善

## ログ確認コマンド
```bash
# 最新ログの確認
tail -50 data/logs/$(date +%Y-%m-%d).log

# VPM関連ログの抽出
grep -i "vpm\|convert" data/logs/$(date +%Y-%m-%d).log

# エラーログの確認
grep -i "error\|failed" data/logs/$(date +%Y-%m-%d).log
```

## 次のアクション
1. 現在の不完全な状態をリセット
2. Docker Composeで再起動
3. 10分間待機して完全な生成を確認
4. 結果に応じてコード修正または完了