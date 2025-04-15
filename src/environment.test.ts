import { Environment } from './environment'
import fs from 'node:fs'

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('Environment', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  // ファイルパス取得の正常系テスト
  test('should get file path correctly', () => {
    mockFs.existsSync.mockReturnValue(true)

    const path = Environment.getPath('PRODUCTS_PATH')
    expect(path).toBe('data/products.json')
  })

  // ディレクトリパス取得の正常系テスト
  test('should get directory path correctly', () => {
    mockFs.existsSync.mockReturnValue(true)

    const path = Environment.getPath('CACHE_DIR', 'test')
    expect(path).toBe('data/cache/test')
  })

  // ファイルパスにファイル名を指定した場合のエラー検証テスト
  test('should throw error if filename provided for file path', () => {
    expect(() => {
      // @ts-expect-error テスト時に意図的に型エラーを発生させる
      Environment.getPath('PRODUCTS_PATH', 'filename')
    }).toThrow('Filename is not allowed for PRODUCTS_PATH, it is a file path')
  })

  // ディレクトリが存在しない場合に作成されるかのテスト
  test('should create directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    Environment.getPath('CACHE_DIR', 'test')
    expect(mockFs.mkdirSync).toHaveBeenCalled()
  })

  // 存在しない環境変数キー指定時のエラー検証テスト
  test('should throw error for invalid environment variable', () => {
    expect(() => {
      // @ts-expect-error テスト用に存在しないキーを指定
      Environment.getPath('INVALID_KEY')
    }).toThrow('Environment variable INVALID_KEY is not set')
  })

  // ディレクトリパスの末尾にスラッシュが付与されるかのテスト
  test('should add trailing slash to directory path if missing', () => {
    mockFs.existsSync.mockReturnValue(true)

    // 内部実装をテストするために一時的に環境変数をオーバーライド
    const originalEnv = process.env.CACHE_DIR
    process.env.CACHE_DIR = 'data/cache' // スラッシュなし

    const path = Environment.getPath('CACHE_DIR', 'test')
    expect(path).toBe('data/cache/test')

    // 元に戻す
    process.env.CACHE_DIR = originalEnv
  })
})
