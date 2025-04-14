import fs from 'node:fs'

export class Environment {
  private env = {
    PRODUCTS_PATH: {
      value: process.env.PRODUCTS_PATH ?? 'data/products.json',
      isFile: true,
    },
    ID_MAPPING_PATH: {
      value: process.env.ID_MAPPING_PATH ?? 'data/id_linking.json',
      isFile: true,
    },
    COOKIE_PATH: {
      value: process.env.COOKIE_PATH ?? 'data/cookies.json',
      isFile: true,
    },
    CACHE_DIR: {
      value: process.env.CACHE_DIR ?? 'data/cache/',
      isFile: false,
    },
    DOWNLOADED_ITEMS_DIR: {
      value: process.env.DOWNLOADED_ITEMS_DIR ?? 'data/items/',
      isFile: false,
    },
    NEW_DIR: {
      value: process.env.NEW_PRODUCTS_DIR ?? 'data/new/',
      isFile: false,
    },
  } as const

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getPath<T extends keyof Environment['env']>(
    key: T,
    filename?: Environment['env'][T]['isFile'] extends true ? undefined : string
  ): string {
    const env = new Environment()
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!env.env[key]) {
      throw new Error(`Environment variable ${key} is not set`)
    }
    let path = env.env[key].value
    const isFile = env.env[key].isFile
    if (isFile && filename) {
      throw new Error(`Filename is not allowed for ${key}, it is a file path`)
    }

    this.makeDir(path, isFile)

    if (!isFile && !path.endsWith('/') && !path.endsWith('\\')) {
      path += '/'
    }

    return isFile ? path : `${path}${filename}`
  }

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
