import fs from 'node:fs'

export class Environment {
  private env = {
    IS_HEADLESS: {
      value: process.env.IS_HEADLESS ?? 'false',
      type: 'boolean',
    },
    IS_IGNORE_COOKIE: {
      value: process.env.IS_IGNORE_COOKIE ?? 'false',
      type: 'boolean',
    },
    CHROMIUM_PATH: {
      value: process.env.CHROMIUM_PATH,
      type: 'file',
    },
    PRODUCTS_PATH: {
      value: process.env.PRODUCTS_PATH ?? 'data/products.json',
      type: 'file',
    },
    ID_MAPPING_PATH: {
      value: process.env.ID_MAPPING_PATH ?? 'data/id_linking.json',
      type: 'file',
    },
    LINKED_ITEMS_PATH: {
      value: process.env.LINKED_ITEMS_PATH ?? 'data/linked_items.md',
      type: 'file',
    },
    LINKED_ITEMS_HTML_PATH: {
      value:
        process.env.LINKED_ITEMS_HTML_PATH ?? 'data/public/linked_items.html',
      type: 'file',
    },
    COOKIE_PATH: {
      value: process.env.COOKIE_PATH ?? 'data/cookies.json',
      type: 'file',
    },
    CACHE_DIR: {
      value: process.env.CACHE_DIR ?? 'data/cache/',
      type: 'directory',
    },
    DOWNLOADED_ITEMS_DIR: {
      value: process.env.DOWNLOADED_ITEMS_DIR ?? 'data/items/',
      type: 'directory',
    },
    NEW_DIR: {
      value: process.env.NEW_PRODUCTS_DIR ?? 'data/new/',
      type: 'directory',
    },
    DISCORD_WEBHOOK_URL: {
      value: process.env.DISCORD_WEBHOOK_URL,
      type: 'text',
    },
    VPM_REPOSITORY_DIR: {
      value: process.env.VPM_REPOSITORY_DIR ?? 'data/vpm-repository/',
      type: 'directory',
    },
    VPM_ENABLED: {
      value: process.env.VPM_ENABLED ?? 'true',
      type: 'boolean',
    },
    VPM_BASE_URL: {
      value: process.env.VPM_BASE_URL ?? '',
      type: 'string',
    },
    VPM_CREATE_FALLBACK_PACKAGES: {
      value: process.env.VPM_CREATE_FALLBACK_PACKAGES ?? 'false',
      type: 'boolean',
    },
    VPM_FORCE_REBUILD: {
      value: process.env.VPM_FORCE_REBUILD ?? 'false',
      type: 'boolean',
    },
    FREE_ITEMS_PATH: {
      value: process.env.FREE_ITEMS_PATH ?? 'data/free-items.json',
      type: 'file',
    },
    WISHLIST_IDS: {
      value: process.env.WISHLIST_IDS ?? '',
      type: 'string',
    },
  } as const

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  /**
   * 値を取得する
   *
   * @param key 環境変数名
   * @returns 値
   * @throws 環境変数が設定されていない場合
   */
  public static getValue<T extends keyof Environment['env']>(
    key: T
  ): Environment['env'][T]['value'] {
    const env = new Environment()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!env.env[key]) {
      throw new Error(`Environment variable ${key} is not set`)
    }
    return env.env[key].value
  }

  /**
   * 値をboolean型で取得する
   *
   * @param key 環境変数名
   * @returns 値
   */
  public static getBoolean(key: keyof Environment['env']): boolean {
    const env = new Environment()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!env.env[key]) {
      throw new Error(`Environment variable ${key} is not set`)
    }
    const value = env.env[key].value
    const type = env.env[key].type
    if (type !== 'boolean') {
      throw new Error(`Environment variable ${key} is not a boolean`)
    }
    if (value === 'true') {
      return true
    } else if (value === 'false') {
      return false
    }
    throw new Error(`Environment variable ${key} is not a boolean`)
  }

  /**
   * パスを取得する
   *
   * @param key 環境変数名
   * @param filename ファイル名（ディレクトリの場合のみ）
   * @returns パス
   */
  public static getPath<T extends keyof Environment['env']>(
    key: T,
    filename?: Environment['env'][T]['type'] extends 'directory'
      ? string
      : never
  ): string {
    const env = new Environment()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!env.env[key]) {
      throw new Error(`Environment variable ${key} is not set`)
    }
    let path = env.env[key].value
    const type = env.env[key].type
    const isFile = type === 'file'
    const isDirectory = type === 'directory'

    if (isFile && filename) {
      throw new Error(`Filename is not allowed for ${key}, it is a file path`)
    }
    if (!isFile && !isDirectory) {
      throw new Error(`Should be a file or directory path for ${key}`)
    }
    if (!path) {
      throw new Error(`Environment variable ${key} is not set`)
    }

    this.makeDir(path, isFile)

    if (isDirectory && filename) {
      if (!path.endsWith('/') && !path.endsWith('\\')) {
        path += '/'
      }
      path += filename
    }

    return path
  }

  /**
   * ディレクトリを作成する
   *
   * @param path パス
   * @param isFile ファイルかどうか
   */
  private static makeDir(path: string, isFile: boolean): void {
    const parentDir = isFile
      ? path.slice(0, Math.max(0, path.lastIndexOf('/')))
      : path
    if (fs.existsSync(parentDir)) {
      return
    }
    fs.mkdirSync(parentDir, { recursive: true })
  }
}
