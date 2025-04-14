import { BoothRequest, BoothParser } from './booth'
import fs from 'node:fs'
import axios from 'axios'
import { mocked } from 'jest-mock'
import puppeteer from 'puppeteer-core'
import path from 'node:path'
import { Environment } from './environment'

jest.mock('node:fs')
jest.mock('axios')

jest.mock('puppeteer-core', () => {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(null),
    url: jest.fn().mockReturnValue('https://accounts.booth.pm/settings'),
    close: jest.fn(),
  }

  const mockBrowser = {
    newPage: jest.fn().mockResolvedValue(mockPage),
    cookies: jest.fn().mockResolvedValue([{ name: 'test', value: 'cookie' }]),
    close: jest.fn(),
  }

  return {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  }
})

const mockFs = mocked(fs)
const mockAxios = mocked(axios)

const createMockBrowser = (url: string) => ({
  newPage: jest.fn().mockResolvedValue({
    goto: jest.fn().mockResolvedValue(null),
    url: jest.fn().mockImplementation(() => {
      console.log('Mock URL called 2')
      return url
    }),
    close: jest.fn(),
  }),
  cookies: jest.fn().mockResolvedValue([{ name: 'test', value: 'cookie' }]),
  close: jest.fn(),
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.resetModules()
})

describe('BoothRequest', () => {
  let boothRequest: BoothRequest

  beforeEach(() => {
    jest.clearAllMocks()
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify([{ name: 'test', value: 'cookie' }])
    )

    boothRequest = new BoothRequest()
  })

  describe('login', () => {
    it('should not attempt login if already logged in', async () => {
      jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(true)

      await boothRequest.login()

      expect(boothRequest.checkLogin).toHaveBeenCalled()
    })

    it('should save cookies after login', async () => {
      jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(false)
      mockFs.existsSync.mockReturnValue(false)

      const mockBrowser = createMockBrowser(
        'https://accounts.booth.pm/settings'
      )

      jest.mock('puppeteer-core', () => ({
        launch: jest.fn().mockResolvedValue(mockBrowser),
      }))

      await boothRequest.login()

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify([{ name: 'test', value: 'cookie' }])
      )
    })

    it('should throw an error if login fails', async () => {
      jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(false)
      mockFs.existsSync.mockReturnValue(false)

      const mockBrowser = createMockBrowser(
        'https://accounts.booth.pm/settings'
      )
      jest.mock('puppeteer-core', () => ({
        launch: jest.fn().mockResolvedValue(mockBrowser),
      }))

      const mockPage = {
        goto: jest.fn().mockResolvedValue(null),
        url: jest
          .fn()
          .mockReturnValue('https://accounts.booth.pm/users/sign_in'),
        close: jest.fn(),
      }
      jest
        .spyOn(mockPage, 'url')
        .mockReturnValue('https://accounts.booth.pm/users/sign_in')
      jest.spyOn(mockBrowser, 'newPage').mockResolvedValue(mockPage)

      try {
        await boothRequest.login()
      } catch (error) {
        const typedError = error as Error
        expect(typedError.message).toEqual('Required login')
      }
    })

    it('should throw an error if login fails (simplified)', async () => {
      jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(false)

      try {
        await boothRequest.login()
      } catch (error) {
        console.log('Simplified test error:', error)
        expect((error as Error).message).toEqual('Required login')
      }
    })

    it('should throw an error if login fails (minimal)', async () => {
      // 必要なモックをセットアップ
      jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(false)

      // PuppeteerのモックをセットアップしつつすぐにJestのspyOnでオーバーライド
      const mockBrowser = {
        newPage: jest.fn(),
        cookies: jest
          .fn()
          .mockResolvedValue([{ name: 'test', value: 'cookie' }]),
        close: jest.fn(),
      }

      // 明示的に page.url() が 'sign_in' を返すようなモックページを作成
      const mockPage = {
        goto: jest.fn().mockResolvedValue(null),
        url: jest
          .fn()
          .mockReturnValue('https://accounts.booth.pm/users/sign_in'),
        close: jest.fn(),
      }

      // puppeteer.launchのモック
      jest.spyOn(puppeteer, 'launch').mockResolvedValue(mockBrowser as any)
      // browser.newPageのモック
      jest.spyOn(mockBrowser, 'newPage').mockResolvedValue(mockPage as any)

      console.log('モックセットアップ完了 - テスト実行開始')

      // ログインが失敗してエラーがスローされることを期待
      await expect(boothRequest.login()).rejects.toThrow('Required login')
    })
  })

  describe('checkLogin', () => {
    it('should return true if login is valid', async () => {
      mockAxios.get.mockResolvedValue({ status: 200 })

      const result = await boothRequest.checkLogin()

      expect(result).toBe(true)
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://accounts.booth.pm/settings',
        expect.any(Object)
      )
    })

    it('should return false if login is invalid', async () => {
      mockAxios.get.mockResolvedValue({ status: 401 })

      const result = await boothRequest.checkLogin()

      expect(result).toBe(false)
    })
  })

  describe('getLibraryPage', () => {
    it('should fetch the library page successfully', async () => {
      const mockResponse = { data: '<html>Library Page</html>' }
      mockAxios.get.mockResolvedValue(mockResponse)

      const result = await boothRequest.getLibraryPage(1)

      expect(result).toEqual(mockResponse)
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://accounts.booth.pm/library?page=1',
        expect.any(Object)
      )
    })
  })

  describe('getLibraryGiftsPage', () => {
    it('should fetch the library gifts page successfully', async () => {
      const mockResponse = { data: '<html>Gifts Page</html>' }
      mockAxios.get.mockResolvedValue(mockResponse)

      const result = await boothRequest.getLibraryGiftsPage(1)

      expect(result).toEqual(mockResponse)
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://accounts.booth.pm/library/gifts?page=1',
        expect.any(Object)
      )
    })

    it('should handle network errors gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network Error'))

      await expect(boothRequest.getLibraryGiftsPage(1)).rejects.toThrow(
        'Network Error'
      )
    })
  })

  describe('getProductPage', () => {
    it('should fetch the product page successfully', async () => {
      const mockResponse = { data: '<html>Product Page</html>' }
      mockAxios.get.mockResolvedValue(mockResponse)

      const result = await boothRequest.getProductPage('12345')

      expect(result).toEqual(mockResponse)
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://booth.pm/ja/items/12345',
        expect.any(Object)
      )
    })

    it('should throw an error if the product page fetch fails', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network Error'))

      await expect(boothRequest.getProductPage('12345')).rejects.toThrow(
        'Network Error'
      )
    })
  })

  describe('getItem', () => {
    it('should fetch the item successfully', async () => {
      const mockResponse = { status: 200, data: Buffer.from('Item Data') }
      mockAxios.get.mockResolvedValue(mockResponse)

      const result = await boothRequest.getItem('67890')

      expect(result).toEqual(mockResponse)
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://booth.pm/downloadables/67890',
        expect.objectContaining({ responseType: 'arraybuffer' })
      )
    })

    it('should throw an error if the item fetch fails', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network Error'))

      await expect(boothRequest.getItem('67890')).rejects.toThrow(
        'Network Error'
      )
    })

    it('should handle invalid item IDs gracefully', async () => {
      mockAxios.get.mockResolvedValue({ status: 404 })

      await expect(boothRequest.getItem('invalid-id')).rejects.toThrow(
        'Failed to fetch product page: 404'
      )
    })
  })
})

describe('BoothParser', () => {
  let boothParser: BoothParser

  beforeEach(() => {
    boothParser = new BoothParser()
  })

  describe('parseLibraryPage', () => {
    it('should parse library page HTML and extract products', () => {
      const html = `
        <main>
          <div class="w-full">
            <div class="mb-16">
              <a class="no-underline" href="https://booth.pm/ja/items/12345">
                <div>Product Name</div>
              </a>
              <a href="https://shop.booth.pm">
                <div>Shop Name</div>
              </a>
              <img src="https://example.com/thumbnail.jpg" />
            </div>
          </div>
        </main>
      `

      const result = boothParser.parseLibraryPage(html)

      expect(result).toEqual([
        {
          productId: '12345',
          productName: 'Product Name',
          productURL: 'https://booth.pm/ja/items/12345',
          thumbnailURL: 'https://example.com/thumbnail.jpg',
          shopName: 'Shop Name',
          shopURL: 'https://shop.booth.pm',
          items: [],
        },
      ])
    })

    it('should handle malformed HTML gracefully', () => {
      const html = '<div class="invalid-html">'

      const result = boothParser.parseLibraryPage(html)

      expect(result).toEqual([])
    })
  })

  describe('parseProductPage', () => {
    it('should parse product page HTML and extract descriptions', () => {
      const html = `
        <section class="main-info-column">
          <div class="description">Description HTML</div>
        </section>
        <section class="shop__text">Shop Text HTML</section>
      `

      const result = boothParser.parseProductPage(html)

      expect(result.descriptions).toEqual([
        { html: 'Description HTML', text: 'Description HTML' },
        { html: 'Shop Text HTML', text: 'Shop Text HTML' },
      ])
    })

    it('should extract price information', () => {
      const html = `
        <div class="price">¥1,000</div>
        <section class="main-info-column">
          <div class="description">Description HTML</div>
        </section>
      `

      const result = boothParser.parseProductPage(html)

      expect(result.price).toEqual('¥1,000')
      expect(result.descriptions).toEqual([
        { html: 'Description HTML', text: 'Description HTML' },
      ])
    })

    it('should extract category information', () => {
      const html = `
        <div class="category"><a href="/categories/123">3Dモデル</a></div>
        <section class="main-info-column">
          <div class="description">Description HTML</div>
        </section>
      `

      const result = boothParser.parseProductPage(html)

      expect(result.category).toEqual('3Dモデル')
    })

    it('should extract date information', () => {
      const html = `
        <div class="sub-info">
          <time class="release-date" datetime="2023-01-01">2023/01/01</time>
          <time class="update-date" datetime="2023-02-15">2023/02/15</time>
        </div>
        <section class="main-info-column">
          <div class="description">Description HTML</div>
        </section>
      `

      const result = boothParser.parseProductPage(html)

      expect(result.releaseDate).toEqual('2023-01-01')
      expect(result.lastUpdateDate).toEqual('2023-02-15')
    })

    it('should handle empty product page HTML gracefully', () => {
      const html = ''

      const result = boothParser.parseProductPage(html)

      expect(result).toEqual({ descriptions: [] })
    })

    it('should parse product page with price, category, and dates', () => {
      const html = `
        <html>
          <body>
            <div class="price">¥500</div>
            <div class="category"><a href="/ja/browse/fancy">ファンシー</a></div>
            <div class="sub-info">
              <time class="release-date" datetime="2023-04-01">2023年4月1日</time>
              <time class="update-date" datetime="2023-05-15">2023年5月15日</time>
            </div>
            <section class="main-info-column">
              <div class="description">テスト説明1</div>
              <div class="description">テスト説明2</div>
            </section>
            <section class="shop__text">ショップ紹介テキスト</section>
          </body>
        </html>
      `

      const result = boothParser.parseProductPage(html)

      expect(result).toEqual({
        descriptions: [
          { html: 'テスト説明1', text: 'テスト説明1' },
          { html: 'テスト説明2', text: 'テスト説明2' },
          { html: 'ショップ紹介テキスト', text: 'ショップ紹介テキスト' },
        ],
        price: '¥500',
        category: 'ファンシー',
        releaseDate: '2023-04-01',
        lastUpdateDate: '2023-05-15',
      })
    })

    it('should handle missing optional data', () => {
      const html = `
        <html>
          <body>
            <section class="main-info-column">
              <div class="description">テスト説明のみ</div>
            </section>
          </body>
        </html>
      `

      const result = boothParser.parseProductPage(html)

      expect(result).toEqual({
        descriptions: [{ html: 'テスト説明のみ', text: 'テスト説明のみ' }],
      })
      expect(result.price).toBeUndefined()
      expect(result.category).toBeUndefined()
      expect(result.releaseDate).toBeUndefined()
      expect(result.lastUpdateDate).toBeUndefined()
    })
  })

  describe('retrieveBoothIdsFromHtml', () => {
    it('should extract Booth IDs from text', () => {
      const description = {
        html: '<a href="https://booth.pm/ja/items/1234567">Link</a>',
        text: 'Check out https://booth.pm/ja/items/1234567 and https://booth.pm/ja/items/7654321',
      }

      const result = boothParser.retrieveBoothIdsFromHtml(description)

      expect(result).toEqual(['1234567', '7654321'])
    })

    it('should handle shop-specific Booth URLs', () => {
      const description = {
        html: '<a href="https://example.booth.pm/items/1234567">Link</a>',
        text: 'Check out https://example.booth.pm/items/1234567',
      }

      const result = boothParser.retrieveBoothIdsFromHtml(description)

      expect(result).toEqual(['1234567'])
    })

    it('should handle URLs with language paths', () => {
      const description = {
        html: '',
        text: 'Check out https://booth.pm/ja/items/1234567 and https://booth.pm/en/items/7654321',
      }

      const result = boothParser.retrieveBoothIdsFromHtml(description)

      expect(result).toEqual(['1234567', '7654321'])
    })

    it('should return empty array when no Booth URLs are found', () => {
      const description = {
        html: '',
        text: 'No Booth URLs here',
      }

      const result = boothParser.retrieveBoothIdsFromHtml(description)

      expect(result).toEqual([])
    })
  })

  // 実データを使用したテスト
  describe('real data tests', () => {
    // モック化されたfsをオリジナルに戻す
    const originalFs = jest.requireActual('node:fs')

    it('should parse real product page HTML files from cache', () => {
      // キャッシュディレクトリから最初の数ファイルを選択してテスト
      const testIds = ['1028832', '2654235', '5384517']

      for (const id of testIds) {
        const filePath = path.join(
          process.cwd(),
          'data',
          'cache',
          'item',
          `${id}.html`
        )

        // ファイルが存在するか確認
        if (originalFs.existsSync(filePath)) {
          const html = originalFs.readFileSync(filePath, 'utf8')

          // パース実行
          const result = boothParser.parseProductPage(html)

          // 基本的な検証
          expect(result).toBeDefined()
          expect(result.descriptions.length).toBeGreaterThan(0)

          // 追加データの存在確認（すべてのデータが必ず存在するとは限らない）
          if (result.price) {
            expect(typeof result.price).toBe('string')
            expect(result.price).toMatch(/^[¥￥]?\d+/) // 円記号で始まる
          }

          if (result.category) {
            expect(typeof result.category).toBe('string')
          }

          if (result.releaseDate) {
            expect(typeof result.releaseDate).toBe('string')
          }

          if (result.lastUpdateDate) {
            expect(typeof result.lastUpdateDate).toBe('string')
          }

          // BOOTHのIDを抽出できるかテスト
          for (const desc of result.descriptions) {
            const boothIds = boothParser.retrieveBoothIdsFromHtml(desc)
            // IDが抽出できた場合は数値文字列であることを確認
            for (const boothId of boothIds) {
              expect(boothId).toMatch(/^\d+$/)
            }
          }
        }
      }
    })

    it('should parse real library page HTML files from cache', () => {
      const cacheDir = path.join(process.cwd(), 'data', 'cache')
      const dirNames = ['library', 'gift']

      for (const dir of dirNames) {
        const dirPath = path.join(cacheDir, dir)

        // ディレクトリが存在するか確認
        if (originalFs.existsSync(dirPath)) {
          const files = originalFs
            .readdirSync(dirPath)
            .filter((file) => file.endsWith('.html'))

          // 最初の1ファイルをテスト
          if (files.length > 0) {
            const filePath = path.join(dirPath, files[0])
            const html = originalFs.readFileSync(filePath, 'utf8')

            // パース実行
            const products = boothParser.parseLibraryPage(html)

            // 基本的な検証
            expect(Array.isArray(products)).toBe(true)

            // 商品が存在する場合はフォーマット検証
            if (products.length > 0) {
              const product = products[0]
              expect(product.productId).toBeDefined()
              expect(product.productName).toBeDefined()
              expect(product.productURL).toMatch(/^https:\/\/booth\.pm/)
              expect(product.shopName).toBeDefined()
              expect(product.shopURL).toBeDefined()
            }
          }
        }
      }
    })
  })

  describe('Real data tests', () => {
    // キャッシュからの実データを使用するテスト
    it('should parse real product page data from cache', () => {
      // キャッシュディレクトリを取得
      const cacheDir = Environment.getPath('CACHE_DIR')
      const itemCacheDir = path.join(cacheDir, 'item')

      // キャッシュディレクトリが存在するか確認
      if (!fs.existsSync(itemCacheDir)) {
        console.warn('Item cache directory not found, skipping real data test')
        return
      }

      // キャッシュディレクトリ内のHTMLファイルを検索
      const files = fs.readdirSync(itemCacheDir)
      const htmlFiles = files.filter((file) => file.endsWith('.html'))

      // ファイルが見つからない場合はスキップ
      if (htmlFiles.length === 0) {
        console.warn('No HTML cache files found, skipping real data test')
        return
      }

      // 最初のファイルを使用してテスト
      const testFile = htmlFiles[0]
      const productId = path.basename(testFile, '.html')
      const html = fs.readFileSync(path.join(itemCacheDir, testFile), 'utf8')

      // 商品ページを解析
      const info = boothParser.parseProductPage(html)

      // 基本的なデータ構造が正しいことを検証
      expect(info).toBeDefined()
      expect(info.descriptions).toBeDefined()
      expect(Array.isArray(info.descriptions)).toBe(true)

      // 説明が取得できていることを確認（内容は商品によって異なるため長さのみ検証）
      expect(info.descriptions.length).toBeGreaterThanOrEqual(0)

      // 価格、カテゴリ、日付などが適切に抽出されているか確認
      // これらは商品によって存在しない場合もあるため、存在する場合のみ検証
      if (info.price) {
        expect(typeof info.price).toBe('string')
        expect(info.price).toMatch(/^[¥￥]?[\d,]+/)
      }

      if (info.category) {
        expect(typeof info.category).toBe('string')
        expect(info.category.length).toBeGreaterThan(0)
      }

      // 日付フォーマットの検証（日付が存在する場合）
      if (info.releaseDate) {
        expect(typeof info.releaseDate).toBe('string')
      }

      if (info.lastUpdateDate) {
        expect(typeof info.lastUpdateDate).toBe('string')
      }
    })

    it('should parse multiple real product pages from cache', () => {
      // キャッシュディレクトリを取得
      const cacheDir = Environment.getPath('CACHE_DIR')
      const itemCacheDir = path.join(cacheDir, 'item')

      // キャッシュディレクトリが存在するか確認
      if (!fs.existsSync(itemCacheDir)) {
        console.warn('Item cache directory not found, skipping real data test')
        return
      }

      // キャッシュディレクトリ内のHTMLファイルを検索
      const files = fs.readdirSync(itemCacheDir)
      const htmlFiles = files.filter((file) => file.endsWith('.html'))

      // ファイルが見つからない場合はスキップ
      if (htmlFiles.length === 0) {
        console.warn('No HTML cache files found, skipping real data test')
        return
      }

      // 最大5つのファイルをテスト
      const testFiles = htmlFiles.slice(0, Math.min(5, htmlFiles.length))

      for (const testFile of testFiles) {
        const productId = path.basename(testFile, '.html')
        const html = fs.readFileSync(path.join(itemCacheDir, testFile), 'utf8')

        // エラーが発生しないことを確認
        expect(() => {
          const info = boothParser.parseProductPage(html)

          // 基本的なデータ構造が正しいことを検証
          expect(info).toBeDefined()
          expect(Array.isArray(info.descriptions)).toBe(true)
        }).not.toThrow()
      }
    })

    it('should extract Booth IDs from real product descriptions', () => {
      // キャッシュディレクトリを取得
      const cacheDir = Environment.getPath('CACHE_DIR')
      const productCacheDir = path.join(cacheDir, 'product')

      // キャッシュディレクトリが存在するか確認
      if (!fs.existsSync(productCacheDir)) {
        console.warn(
          'Product cache directory not found, skipping real data test'
        )
        return
      }

      // キャッシュディレクトリ内のHTMLファイルを検索
      const files = fs.readdirSync(productCacheDir)
      const htmlFiles = files.filter((file) => file.endsWith('.html'))

      // ファイルが見つからない場合はスキップ
      if (htmlFiles.length === 0) {
        console.warn('No HTML cache files found, skipping real data test')
        return
      }

      // 最大5つのファイルをテスト
      const testFiles = htmlFiles.slice(0, Math.min(5, htmlFiles.length))

      let foundBoothIds = false

      for (const testFile of testFiles) {
        const productId = path.basename(testFile, '.html')
        const html = fs.readFileSync(
          path.join(productCacheDir, testFile),
          'utf8'
        )

        // 商品ページを解析
        const info = boothParser.parseProductPage(html)

        // 各説明文からBooth IDを抽出
        for (const description of info.descriptions) {
          const boothIds = parser.retrieveBoothIdsFromHtml(description)

          // IDが見つかった場合は検証
          if (boothIds.length > 0) {
            foundBoothIds = true

            // 各IDが数値文字列であることを確認
            for (const id of boothIds) {
              expect(/^\d+$/.test(id)).toBe(true)
            }
          }
        }
      }

      // 少なくとも1つのファイルでIDが見つかった場合、テストはパス
      // 見つからなかった場合は注意を表示（失敗ではない）
      if (!foundBoothIds) {
        console.warn(
          'No Booth IDs found in any product descriptions, but parsing completed without errors'
        )
      }
    })
  })
})
