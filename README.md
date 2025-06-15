# Booth Purchased Items Manager

BOOTHで購入した商品や無料配布商品を管理するツールです。

## 機能

- 購入済み商品（ライブラリ）の取得
- ギフトで受け取った商品の取得
- 無料配布商品の取得
- **欲しいものリストから無料アイテムの自動検出と取得** (新機能)
- 商品間のリンク関係の抽出
- 商品ファイルの自動ダウンロード
- VPMリポジトリへの変換（UnityPackageの場合）
- Discord Webhookによる新着通知

## 欲しいものリスト機能

複数の欲しいものリストを監視し、その中から無料アイテムを自動的に検出してダウンロードします。

### 設定方法

1. `data/wishlists.json` ファイルを作成または編集します：

```json
{
  "wishlists": [
    {
      // 公開欲しいものリスト（認証不要）
      "type": "public",
      "name": "pg2TPBOG",  // URLの末尾部分
      "description": "公開欲しいものリスト"
    },
    {
      // 非公開欲しいものリスト（認証必要）
      "type": "private",
      "id": "123456",  // リストのID
      "description": "非公開欲しいものリスト"
    }
  ]
}
```

### 欲しいものリストのURL形式

- **公開リスト**: `https://booth.pm/wish_list_names/{name}`
  - 例: `https://booth.pm/wish_list_names/pg2TPBOG`
  - `name` パラメータに URLの末尾部分を指定します

- **非公開リスト**: `https://accounts.booth.pm/wish_lists/{id}`
  - 例: `https://accounts.booth.pm/wish_lists/123456`
  - `id` パラメータにリストのIDを指定します
  - ログインが必要です

### 動作の流れ

1. 設定された欲しいものリストから全商品を取得
2. 各商品のページにアクセスして無料配布かどうかを確認
3. 無料配布商品の場合、自動的にダウンロード対象に追加
4. 通常の購入済み商品と同様に処理

## 環境変数

| 変数名 | 説明 | デフォルト値 |
|--------|------|--------------|
| `IS_HEADLESS` | ヘッドレスモードで実行 | `false` |
| `IS_IGNORE_COOKIE` | クッキーを無視 | `false` |
| `CHROMIUM_PATH` | Chromiumのパス | - |
| `PRODUCTS_PATH` | 商品情報の保存パス | `data/products.json` |
| `ID_MAPPING_PATH` | IDマッピングの保存パス | `data/id_linking.json` |
| `LINKED_ITEMS_PATH` | リンク済みアイテムの保存パス | `data/linked_items.md` |
| `COOKIE_PATH` | クッキーの保存パス | `data/cookies.json` |
| `CACHE_DIR` | キャッシュディレクトリ | `data/cache/` |
| `DOWNLOADED_ITEMS_DIR` | ダウンロードアイテムの保存ディレクトリ | `data/items/` |
| `NEW_DIR` | 新着アイテムの保存ディレクトリ | `data/new/` |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL | - |
| `VPM_REPOSITORY_DIR` | VPMリポジトリディレクトリ | `data/vpm-repository/` |
| `VPM_ENABLED` | VPM変換を有効化 | `true` |
| `VPM_BASE_URL` | VPMベースURL | - |
| `FREE_ITEMS_PATH` | 無料アイテムリストのパス | `data/free-items.json` |
| `WISHLISTS_PATH` | 欲しいものリスト設定のパス | `data/wishlists.json` |

## 使用方法

### Dockerを使用する場合

```bash
docker compose up
```

### ローカルで実行する場合

```bash
pnpm install
pnpm start
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。