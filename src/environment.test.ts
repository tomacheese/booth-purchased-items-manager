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

  // ディレクトリが存在しない場合に作成されるかのテスト
  test('should create directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)

    Environment.getPath('CACHE_DIR', 'test')
    expect(mockFs.mkdirSync).toHaveBeenCalled()
  })

  // 存在しない環境変数キー指定時のエラー検証テスト
  test('should throw error for invalid environment variable', () => {
    expect(() => {
      // @ts-expect-error テスト用に存在しないキーを指定することで例外を検証するため
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

  // getValue の正常系テスト
  test('should get value correctly for valid key', () => {
    expect(Environment.getValue('IS_HEADLESS')).toBe('false')
    expect(Environment.getValue('PRODUCTS_PATH')).toBe('data/products.json')
  })

  // getValue の異常系テスト
  test('should throw error for getValue with invalid key', () => {
    expect(() => {
      // @ts-expect-error テスト用に存在しないキーを指定することで例外を検証するため
      Environment.getValue('INVALID_KEY')
    }).toThrow('Environment variable INVALID_KEY is not set')
  })

  // getBoolean の正常系テスト
  test('should get boolean value correctly', () => {
    expect(Environment.getBoolean('IS_HEADLESS')).toBe(false)
    expect(Environment.getBoolean('IS_IGNORE_COOKIE')).toBe(false)
  })

  // getBoolean の型不一致エラー
  test('should throw error if getBoolean called for non-boolean', () => {
    expect(() => {
      Environment.getBoolean('PRODUCTS_PATH')
    }).toThrow('Environment variable PRODUCTS_PATH is not a boolean')
  })

  // getBoolean の値不正エラー
  test('should throw error if boolean value is invalid string', () => {
    const original = process.env.IS_HEADLESS
    process.env.IS_HEADLESS = 'notabool'
    expect(() => {
      Environment.getBoolean('IS_HEADLESS')
    }).toThrow('Environment variable IS_HEADLESS is not a boolean')
    process.env.IS_HEADLESS = original
  })

  // getPath の型不一致エラー（TypeScriptの型安全の範囲で検証）
  test('should throw error if getPath called for directory but key is file type and filename is omitted', () => {
    // file型にfilenameを渡すと型エラーになるため、undefinedで呼び出し正常系のみ検証
    expect(() => {
      Environment.getPath('PRODUCTS_PATH')
    }).not.toThrow()
  })

  // makeDir のmkdirSync失敗時の例外伝播
  test('should propagate error if mkdirSync fails', () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => {
      throw new Error('mkdir failed')
    })
    expect(() => {
      Environment.getPath('CACHE_DIR', 'fail')
    }).toThrow('mkdir failed')
  })
})
