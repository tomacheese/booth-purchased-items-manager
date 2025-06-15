# Rebuild and Verify VPM Repository

VPMリポジトリを完全に再構築し、詳細な検証を行います。

## 実行手順
1. 既存のVPMリポジトリを削除
2. Dockerコンテナを再ビルド・起動
3. 生成プロセスを監視
4. パッケージ名とpackage.json内容の一貫性を確認
5. 異なるパッケージ間のデータ混入がないかチェック
6. VPMパッケージとしての使いやすさを検証
7. 問題があればコードを修正してコミット

## 手動実行コマンド
```bash
docker compose down
docker compose run --rm app rm -rf /app/data/vpm-repository
docker compose up --build -d
# 生成完了を待つ
pnpm exec tsx verify-packages.ts
```

生成プロセスの監視:
```bash
docker logs booth-purchased-items-manager-app-1 --tail 20 -f
```

## ユーザーのリクエスト

1. docker compose down, rm -rf data/vpm-repository/, docker compose up --build -d を実行
2. 一定時間待つ
3. 生成状態を確認する。確認にあたっては前回の確認から出力されたログと生成データを詳細に確認して、不自然
な生成状態になっていないか確認する
4. 問題がなければ待機時間を延ばして確認。待機時間が上限を突破する、もしくは処理が完了した場合は終了する。
5. 問題があれば処理途中であっても、コードを修正。docker compose down, rm -rf data/vpm-repository/,
docker compose up --build -dを実行し、変更内容をコミット・プッシュする
6. 2に戻る

生成データの確認には、スクリプトを用いて確認することも可能です。
ただし、そのスクリプトはコミット対象にしないでください。

また、確認の観点として、最低限パッケージ名とpackage.jsonの内容を比較し不適切なパッケージ名ではないこと、
本来異なるパッケージにはいるデータが同じパッケージに含まれていないこと、VPMパッケージとして読み込むとき
に使いにくい状態でないことなどを重点的に確認してください。
