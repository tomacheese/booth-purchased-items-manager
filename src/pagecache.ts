import fs from 'node:fs'
import { Environment } from './environment'

export class PageCache {
  private metrics: {
    hit: number
    miss: number
    expired: number
    saved: number
  } = {
    hit: 0,
    miss: 0,
    expired: 0,
    saved: 0,
  }

  /**
   * キャッシュにデータを保存する
   * @param type 種別
   * @param id ID
   * @param data 保存データ
   */
  save(type: string, id: string, data: any) {
    if (!data) {
      return
    }
    const path = this.getPath(type, id)
    this.makeDir(type)
    fs.writeFileSync(path, data)
    this.setSavedAt(type, id)
    this.metrics.saved++
  }

  /**
   * キャッシュアイテムの存在・有効期限をチェックする
   * @param type 種別
   * @param id ID
   * @param expireDays 有効日数 or null
   * @returns 1=有効, 0=存在しない, -1=期限切れ
   */
  checkItemExistence(type: string, id: string, expireDays: number | null) {
    const path = this.getPath(type, id)
    const savedAtPath = `${path}.savedAt`
    if (!fs.existsSync(path) || !fs.existsSync(savedAtPath)) {
      return 0
    }

    if (expireDays === null) {
      // expireDays が null の場合は常に期限切れとして扱う（キャッシュ無効化）
      return -1
    }

    const savedAt = new Date(fs.readFileSync(savedAtPath, 'utf8'))
    const now = new Date()
    const diffDays = Math.floor(
      (now.getTime() - savedAt.getTime()) / (1000 * 3600 * 24)
    )
    if (diffDays > expireDays) {
      return -1
    }

    return 1
  }

  /**
   * キャッシュからデータを読み込む（期限切れ・未存在時はnull）
   * @param type 種別
   * @param id ID
   * @param expireDays 有効日数 or null
   * @returns データ or null
   */
  load(type: string, id: string, expireDays: number | null) {
    const existResult = this.checkItemExistence(type, id, expireDays)
    if (existResult === 0) {
      this.metrics.miss++
      return null
    }
    const path = this.getPath(type, id)
    if (existResult === -1) {
      this.metrics.expired++
      fs.unlinkSync(path)
      fs.unlinkSync(`${path}.savedAt`)
      return null
    }
    this.metrics.hit++
    return fs.readFileSync(path)
  }

  /**
   * キャッシュがあればそれを返し、なければfetchFuncで取得・保存して返す
   * @template T
   * @param type 種別
   * @param id ID
   * @param expireDays 有効日数 or null
   * @param fetchFunc データ取得関数
   * @returns データ
   */
  async loadOrFetch<T>(
    type: string,
    id: string,
    expireDays: number | null,
    fetchFunc: () => Promise<T>
  ): Promise<T> {
    const data = this.load(type, id, expireDays) as T | null
    if (data) {
      return data
    }
    const newData = await fetchFunc()
    this.save(type, id, newData)
    return newData
  }

  /**
   * 指定種別のキャッシュファイル一覧（IDリスト）を取得する
   * @param type 種別
   * @returns IDリスト
   */
  list(type: string) {
    const path = this.getPath(type, '')
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (!fs.existsSync(dir)) {
      return []
    }
    const files = fs.readdirSync(dir, { withFileTypes: true })
    return files
      .filter((file) => file.isFile() && file.name.endsWith('.html'))
      .map((file) => file.name.replace('.html', ''))
  }

  /**
   * キャッシュ操作のメトリクス（ヒット数等）を取得する
   * @returns メトリクスオブジェクト
   */
  getMetrics() {
    return this.metrics
  }

  /**
   * キャッシュ保存日時を記録する（内部利用）
   * @param type 種別
   * @param id ID
   */
  private setSavedAt(type: string, id: string) {
    const path = this.getPath(type, id)
    const savedAtPath = `${path}.savedAt`
    const savedAt = new Date()
    fs.writeFileSync(savedAtPath, savedAt.toISOString(), 'utf8')
  }

  /**
   * キャッシュファイルのパスを生成する（内部利用）
   * @param type 種別
   * @param id ID
   * @returns パス
   */
  private getPath(type: string, id: string) {
    return Environment.getPath('CACHE_DIR', `${type}/${id}.html`)
  }

  /**
   * キャッシュディレクトリを作成する（内部利用）
   * @param type 種別
   */
  private makeDir(type: string) {
    const path = this.getPath(type, '')
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (fs.existsSync(dir)) {
      return
    }
    fs.mkdirSync(dir, { recursive: true })
  }
}
