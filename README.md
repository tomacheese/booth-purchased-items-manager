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

環境変数 `WISHLIST_IDS` に、カンマ区切りでウィッシュリストIDを指定します：

```bash
# 環境変数で設定
export WISHLIST_IDS="KAaTPPrr,other_id,another_id"

# .env ファイルで設定
WISHLIST_IDS=KAaTPPrr,other_id,another_id

# Dockerの場合
docker run -e WISHLIST_IDS="KAaTPPrr,other_id" ...
```

### ウィッシュリストIDの取得方法

ウィッシュリストのURLから末尾のIDを取得します：

- **例**: `https://booth.pm/wish_list_names/KAaTPPrr` → ID: `KAaTPPrr`

### 動作の流れ

1. 設定されたウィッシュリストIDから全商品を取得
2. 各商品のページにアクセスして無料配布かどうかを確認
3. 無料配布商品の場合、自動的にダウンロード対象に追加
4. 通常の購入済み商品と同様に処理

## 環境変数

| 変数名                 | 説明                                   | デフォルト値           |
| ---------------------- | -------------------------------------- | ---------------------- |
| `IS_HEADLESS`          | ヘッドレスモードで実行                 | `false`                |
| `IS_IGNORE_COOKIE`     | クッキーを無視                         | `false`                |
| `CHROMIUM_PATH`        | Chromiumのパス                         | -                      |
| `PRODUCTS_PATH`        | 商品情報の保存パス                     | `data/products.json`   |
| `ID_MAPPING_PATH`      | IDマッピングの保存パス                 | `data/id_linking.json` |
| `LINKED_ITEMS_PATH`    | リンク済みアイテムの保存パス           | `data/linked_items.md` |
| `COOKIE_PATH`          | クッキーの保存パス                     | `data/cookies.json`    |
| `CACHE_DIR`            | キャッシュディレクトリ                 | `data/cache/`          |
| `DOWNLOADED_ITEMS_DIR` | ダウンロードアイテムの保存ディレクトリ | `data/items/`          |
| `NEW_DIR`              | 新着アイテムの保存ディレクトリ         | `data/new/`            |
| `DISCORD_WEBHOOK_URL`  | Discord Webhook URL                    | -                      |
| `VPM_REPOSITORY_DIR`   | VPMリポジトリディレクトリ              | `data/vpm-repository/` |
| `VPM_ENABLED`          | VPM変換を有効化                        | `true`                 |
| `VPM_BASE_URL`         | VPMベースURL                           | -                      |
| `FREE_ITEMS_PATH`      | 無料アイテムリストのパス               | `data/free-items.json` |
| `WISHLIST_IDS`         | 欲しいものリストID（カンマ区切り）     | -                      |

## 無料アイテム設定

無料アイテムは2つの方法で指定できます：

### 1. ファイルによる指定

`data/free-items.json` ファイルで個別の商品IDを指定：

```json
{
  "freeItems": ["1234567", "2345678"]
}
```

### 2. 欲しいものリストによる自動検出

環境変数 `WISHLIST_IDS` で指定したウィッシュリストから自動的に無料アイテムを検出。
両方の方法を併用することも可能です。

## 使用方法

### Dockerを使用する場合

```bash
# 基本的な実行
docker compose up

# 欲しいものリストを指定して実行
WISHLIST_IDS="KAaTPPrr,other_id" docker compose up
```

### ローカルで実行する場合

```bash
pnpm install

# 基本的な実行
pnpm start

# 欲しいものリストを指定して実行
WISHLIST_IDS="KAaTPPrr,other_id" pnpm start
```

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。
