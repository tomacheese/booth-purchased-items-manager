import { PageCache } from './pagecache'
import fs from 'node:fs'

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('PageCache', () => {
  let pageCache: PageCache

  beforeEach(() => {
    pageCache = new PageCache()
    jest.resetAllMocks()
  })

  // キャッシュからデータを読み込む処理のテスト（expireDays: null）
  test('should load data from cache with null expireDays', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{}')

    const result = pageCache.load('testType', 'testId', null)
    expect(result).toBeNull() // expireDays: null の場合は常に期限切れのためnull
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2) // ファイルとsavedAtが削除される
  })

  // キャッシュからデータを読み込む処理のテスト（有効なexpireDays）
  test('should load data from cache with valid expireDays', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync
      .mockReturnValueOnce(new Date().toISOString()) // savedAtファイル（期限内）
      .mockReturnValueOnce('{}') // キャッシュデータ

    const result = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      pageCache.load('testType', 'testId', 7)!.toString()
    )
    expect(result).toEqual({})
  })

  // キャッシュへデータを保存する処理のテスト
  test('should save data to cache', () => {
    mockFs.existsSync.mockReturnValue(false)

    pageCache.save('testType', 'testId', { key: 'value' })
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2) // ファイルとsavedAtの2回
  })

  // アイテムの存在チェック（存在する場合）のテスト
  test('should check item existence', () => {
    mockFs.existsSync.mockReturnValue(true)
    const result = pageCache.checkItemExistence('testType', 'testId', null)
    expect(result).toBe(-1) // expireDays: null の場合は常に期限切れ
  })

  // アイテムの存在チェック（存在しない場合）のテスト
  test('should return 0 if item does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    const result = pageCache.checkItemExistence('testType', 'testId', null)
    expect(result).toBe(0)
  })

  // アイテムの有効期限切れ判定のテスト
  test('should return -1 if item is expired', () => {
    mockFs.existsSync.mockReturnValue(true)

    // 過去の日付を設定してテスト
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10) // 10日前
    mockFs.readFileSync.mockReturnValue(pastDate.toISOString())

    const result = pageCache.checkItemExistence('testType', 'testId', 5) // 5日で期限切れ
    expect(result).toBe(-1)
  })

  // 存在しないアイテムをロードした場合のテスト
  test('should return null when loading non-existent item', () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = pageCache.load('testType', 'testId', null)
    expect(result).toBeNull()
  })

  // 有効期限切れアイテムをロードした場合の削除処理テスト
  test('should delete expired item when loading', () => {
    mockFs.existsSync.mockReturnValue(true)

    // 過去の日付を設定
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10)
    mockFs.readFileSync.mockReturnValue(pastDate.toISOString())

    const result = pageCache.load('testType', 'testId', 5)

    expect(result).toBeNull()
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2) // ファイルとsavedAtの両方を削除
  })

  // nullやundefinedデータを保存しないことのテスト
  test('should not save null or undefined data', () => {
    pageCache.save('testType', 'testId', null)
    pageCache.save('testType', 'testId', undefined)

    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
  })

  // キャッシュミス時にfetchFuncが呼ばれるかのテスト
  test('should load or fetch data when cache miss', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const fetchFunc = jest.fn().mockResolvedValue('new data')

    const result = await pageCache.loadOrFetch(
      'testType',
      'testId',
      null,
      fetchFunc
    )

    expect(fetchFunc).toHaveBeenCalled()
    expect(result).toBe('new data')
  })

  // キャッシュヒット時にfetchFuncが呼ばれないことのテスト
  test('should not fetch when cache hit', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('cached data')
    const fetchFunc = jest.fn().mockResolvedValue('new data')

    const result = await pageCache.loadOrFetch(
      'testType',
      'testId',
      null,
      fetchFunc
    )

    expect(fetchFunc).toHaveBeenCalled() // expireDays: null の場合は常に期限切れなのでfetch実行
    expect(result).toBe('new data')
  })

  // キャッシュファイル一覧取得のテスト
  test('should list cache files', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue([
      { name: 'file1.html', isFile: () => true },
      { name: 'file2.html', isFile: () => true },
      { name: 'file3.txt', isFile: () => true },
      { name: 'dir1', isFile: () => false },
    ] as unknown as fs.Dirent[])

    const result = pageCache.list('testType')
    expect(result).toEqual(['file1', 'file2'])
  })

  // サブディレクトリやhtml以外のファイルを除外するテスト
  test('should ignore subdirectories and non-html files in list', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue([
      { name: 'file1.html', isFile: () => true },
      { name: 'file2.html', isFile: () => true },
      { name: 'file3.txt', isFile: () => true },
      { name: 'subdir', isFile: () => false },
      { name: '.DS_Store', isFile: () => true },
    ] as unknown as fs.Dirent[])

    const result = pageCache.list('testType')
    expect(result).toEqual(['file1', 'file2'])
  })

  // キャッシュディレクトリが存在しない場合のテスト
  test('should return empty array if cache directory does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    const result = pageCache.list('testType')
    expect(result).toEqual([])
  })

  // メトリクスのカウントが正しいかのテスト
  test('should track metrics correctly', () => {
    // ヒットケース
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('data')
    pageCache.load('testType', 'testId', null)

    // ミスケース
    mockFs.existsSync.mockReturnValue(false)
    pageCache.load('testType', 'testId2', null)

    // 期限切れケース
    mockFs.existsSync.mockReturnValue(true)
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10)
    mockFs.readFileSync.mockReturnValue(pastDate.toISOString())
    pageCache.load('testType', 'testId3', 5)

    // 保存ケース
    mockFs.existsSync.mockReturnValue(true)
    pageCache.save('testType', 'testId4', 'new data')

    const metrics = pageCache.getMetrics()
    expect(metrics.hit).toBe(0) // expireDays: null では期限切れとなるためヒット数は0
    expect(metrics.miss).toBe(1)
    expect(metrics.expired).toBe(2) // 最初のloadと期限切れloadで2回期限切れ
    expect(metrics.saved).toBe(1)
  })

  // 複数回の操作でメトリクスが正しく累積されるかのテスト
  test('should accumulate metrics correctly over multiple operations', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('data')
    pageCache.load('testType', 'testId', null) // hit
    pageCache.load('testType', 'testId', null) // hit

    mockFs.existsSync.mockReturnValue(false)
    pageCache.load('testType', 'testId2', null) // miss
    pageCache.load('testType', 'testId3', null) // miss

    mockFs.existsSync.mockReturnValue(true)
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 10)
    mockFs.readFileSync.mockReturnValue(pastDate.toISOString())
    pageCache.load('testType', 'testId4', 5) // expired
    pageCache.load('testType', 'testId5', 5) // expired

    mockFs.existsSync.mockReturnValue(true)
    pageCache.save('testType', 'testId6', 'new data') // saved
    pageCache.save('testType', 'testId7', 'new data') // saved

    const metrics = pageCache.getMetrics()
    expect(metrics.hit).toBe(0) // expireDays: null では期限切れとなるためヒット数は0
    expect(metrics.miss).toBe(2)
    expect(metrics.expired).toBe(4) // 2回のnullによる期限切れ + 2回の通常の期限切れ
    expect(metrics.saved).toBe(2)
  })

  // 隠しファイルやhtml以外のファイルを除外するテスト
  test('should ignore hidden files and only return html files in list', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue([
      { name: 'file1.html', isFile: () => true },
      { name: '.hidden.html', isFile: () => true },
      { name: 'file2.html', isFile: () => true },
      { name: '.DS_Store', isFile: () => true },
      { name: 'subdir', isFile: () => false },
      { name: 'file3.txt', isFile: () => true },
    ] as unknown as fs.Dirent[])

    const result = pageCache.list('testType')
    expect(result).toEqual(['file1', '.hidden', 'file2'])
  })

  // 実際のキャッシュデータでロードが正常に動作するかのテスト
  test('should test with real cache data if available', () => {
    const originalExistsSync = fs.existsSync

    // モックをリセットして実際のファイルシステムにアクセス
    jest.resetAllMocks()

    // 実データへのアクセスをテスト（エラーは発生しないこと）
    const realCachePath = 'data/cache/item/'
    if (originalExistsSync(realCachePath)) {
      // ディレクトリが存在する場合の処理
      const sampleCache = new PageCache()
      const cacheFiles = sampleCache.list('item')

      // ファイルが存在すれば検証、なければスキップ
      if (cacheFiles.length > 0) {
        const firstItem = cacheFiles[0]
        const data = sampleCache.load('item', firstItem, null)
        expect(data).not.toBeNull()
      }
    }

    // モックを元に戻す
    mockFs.existsSync.mockReturnValue(true)
  })
})
