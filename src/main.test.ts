/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-empty-function */
import {
  fetchPurchased,
  fetchFreeItems,
  extractIdLinking,
  downloadItems,
} from './main'
import { BoothRequest, BoothParser, BoothProduct } from './booth'
import { PageCache } from './pagecache'
import { Environment } from './environment'
import fs from 'node:fs'
import axios from 'axios'
import { jest } from '@jest/globals'
import path from 'node:path'
import os from 'node:os'

// Use manual mock for @book000/node-utils
jest.mock('@book000/node-utils')

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    setDefaultEncoding: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
  })),
}))

jest.mock('axios')
jest.mock('./environment')
jest.mock('puppeteer-core', () => ({
  launch: jest.fn().mockImplementation(() => ({
    setCookie: jest.fn(),
    // @ts-expect-error puppeteer-coreのモックに型を合わせる
    cookies: jest.fn().mockResolvedValue([
      {
        name: 'test-cookie',
        value: 'test-value',
        domain: 'booth.pm',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        session: true,
      },
    ]),
    newPage: jest.fn().mockImplementation(() => ({
      goto: jest.fn(),
      url: jest.fn().mockReturnValue('https://accounts.booth.pm/settings'),
      close: jest.fn(),
    })),
    close: jest.fn(),
  })),
}))

const mockAxios = axios as jest.Mocked<typeof axios>
const mockFs = fs as jest.Mocked<typeof fs>
const mockEnvironment = Environment as jest.Mocked<typeof Environment>

describe('Main Functions', () => {
  let boothRequest: BoothRequest
  let boothParser: BoothParser
  let pageCache: PageCache
  let tempDir: string

  beforeEach(() => {
    jest.clearAllMocks()
    tempDir = path.join(os.tmpdir(), `booth-test-${Date.now()}`)

    // モックの設定
    mockFs.existsSync.mockReturnValue(false)
    mockFs.readFileSync.mockReturnValue('[]')

    mockEnvironment.getPath.mockImplementation(
      (key: string, filename?: string) => {
        if (filename) {
          return `${tempDir}/${key}/${filename}`
        }
        return `${tempDir}/${key}`
      }
    )

    boothRequest = new BoothRequest()
    jest.spyOn(boothRequest, 'login').mockResolvedValue()
    jest.spyOn(boothRequest, 'checkLogin').mockResolvedValue(true)
    jest.spyOn(boothRequest, 'getPublicWishlistJson').mockResolvedValue({
      status: 200,
      data: { items: [] },
    } as any)
    jest.spyOn(boothRequest, 'getProductPage').mockResolvedValue({
      status: 200,
      data: '<html>Mock Product Page</html>',
    } as any)

    boothParser = new BoothParser()
    pageCache = new PageCache()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(axios, 'get').mockImplementation((url: string) => {
      if (url.includes('/library?page=')) {
        return Promise.resolve({
          status: 200,
          data: '<html>Mock Library Page</html>',
          statusText: 'OK',
          headers: {},
          config: {},
        })
      } else if (url.includes('/library/gifts?page=')) {
        return Promise.resolve({
          status: 200,
          data: '<html>Mock Gift Page</html>',
          statusText: 'OK',
          headers: {},
          config: {},
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })
    // fetchPurchased系テスト用: loadOrFetchはHTML文字列を返すように
    jest
      .spyOn(pageCache, 'loadOrFetch')
      .mockImplementation((_type, _id, _expireDays, fetchFunc) => fetchFunc())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('fetchPurchased', () => {
    // ユーザーがログイン済みの場合の購入済み商品取得テスト
    test('should fetch purchased items when user is logged in', async () => {
      mockAxios.get.mockReset()
      // libraryページ1
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: `<html>Product 1</html>`,
      })
      // libraryページ2（空）
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html></html>',
      })
      // giftページ1（空）
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html></html>',
      })
      jest
        .spyOn(boothParser, 'parseLibraryPage')
        .mockImplementation((html: string) => {
          if (html.includes('Product 1')) {
            return [
              {
                productId: '12345',
                productName: 'Product 1',
                productURL: 'https://booth.pm/ja/items/12345',
                thumbnailURL: 'https://example.com/image1.jpg',
                shopName: 'Shop 1',
                shopURL: 'https://example.com/shop1',
                items: [
                  {
                    itemId: '67890',
                    itemName: 'Item 1',
                    downloadURL: 'https://booth.pm/downloadables/67890',
                  },
                ],
              },
            ]
          }
          return []
        })
      const result = await fetchPurchased(boothRequest, boothParser, pageCache)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        productId: '12345',
        productName: 'Product 1',
        type: 'library',
      })
      expect(boothRequest.checkLogin).toHaveBeenCalled()
      expect(pageCache.loadOrFetch).toHaveBeenCalledTimes(3)
    })

    // ログインしていない場合にログイン処理が呼ばれるかのテスト
    test('should attempt to login if user is not logged in', async () => {
      mockAxios.get.mockReset()
      // libraryページ（正常）
      mockAxios.get.mockResolvedValue({ status: 200, data: '<html></html>' })
      const loginMock = jest
        .spyOn(boothRequest, 'login')
        .mockResolvedValueOnce()
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockImplementation((_type, _id, _expireDays, fetchFunc) => fetchFunc())
      jest.spyOn(boothParser, 'parseLibraryPage').mockReturnValue([])
      // checkLogin: false→true
      const checkLoginMock = jest.spyOn(boothRequest, 'checkLogin')
      checkLoginMock.mockResolvedValueOnce(false)
      checkLoginMock.mockResolvedValueOnce(true)
      await fetchPurchased(boothRequest, boothParser, pageCache)
      expect(boothRequest.checkLogin).toHaveBeenCalled()
      expect(loginMock).toHaveBeenCalled()
    })

    // ライブラリ・ギフトページに複数商品がある場合のテスト
    test('should handle library and gift pages with multiple items', async () => {
      mockAxios.get.mockReset()
      // libraryページ1
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html>library page 1</html>',
      })
      // libraryページ2（空）
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html></html>',
      })
      // giftページ1
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html>gift page</html>',
      })
      // giftページ2（空）
      mockAxios.get.mockResolvedValueOnce({
        status: 200,
        data: '<html></html>',
      })
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockImplementationOnce((_type, _id, _expireDays, fetchFunc) =>
          fetchFunc()
        )
        .mockImplementationOnce((_type, _id, _expireDays, fetchFunc) =>
          fetchFunc()
        )
        .mockImplementationOnce((_type, _id, _expireDays, fetchFunc) =>
          fetchFunc()
        )
        .mockImplementationOnce((_type, _id, _expireDays, fetchFunc) =>
          fetchFunc()
        )
      jest
        .spyOn(boothParser, 'parseLibraryPage')
        .mockImplementation((html: string) => {
          if (html.includes('library page 1')) {
            return [
              {
                productId: '111',
                productName: 'Lib1',
                productURL: 'url1',
                thumbnailURL: 'thumb1',
                shopName: 'shop1',
                shopURL: 'shopurl1',
                items: [],
              },
            ]
          }
          if (html.includes('gift page')) {
            return [
              {
                productId: '222',
                productName: 'Gift1',
                productURL: 'url2',
                thumbnailURL: 'thumb2',
                shopName: 'shop2',
                shopURL: 'shopurl2',
                items: [],
              },
            ]
          }
          return []
        })
      const result = await fetchPurchased(boothRequest, boothParser, pageCache)
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('library')
      expect(result[0].productId).toBe('111')
      expect(result[1].type).toBe('gift')
      expect(result[1].productId).toBe('222')
    })
  })

  describe('extractIdLinking', () => {
    // 商品説明からIDリンクを抽出するテスト
    test('should extract ID linking from product descriptions', async () => {
      const mockProducts: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Product 1',
          productURL: 'https://booth.pm/ja/items/12345',
          thumbnailURL: 'https://example.com/image1.jpg',
          shopName: 'Shop 1',
          shopURL: 'https://example.com/shop1',
          items: [],
        },
      ]

      // ページキャッシュのモック
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockResolvedValue('<html>product page html</html>')

      // Product pageのパース結果をモック
      jest.spyOn(boothParser, 'parseProductPage').mockReturnValue([
        {
          html: '<p>関連商品: <a href="https://booth.pm/ja/items/67890">商品2</a></p>',
          text: '関連商品: 商品2 https://booth.pm/ja/items/67890',
        },
      ])

      // ID抽出のモック
      jest
        .spyOn(boothParser, 'retrieveBoothIdsFromHtml')
        .mockReturnValue(['67890'])

      const result = await extractIdLinking(
        boothRequest,
        boothParser,
        pageCache,
        mockProducts
      )

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        from: '12345',
        to: '67890',
      })
    })

    // 複数商品・複数リンクのIDリンク抽出テスト
    test('should handle multiple products and multiple links', async () => {
      const mockProducts: BoothProduct[] = [
        {
          productId: '111',
          productName: 'Product 1',
          productURL: 'url1',
          thumbnailURL: 'thumb1',
          shopName: 'shop1',
          shopURL: 'shopurl1',
          items: [],
        },
        {
          productId: '222',
          productName: 'Product 2',
          productURL: 'url2',
          thumbnailURL: 'thumb2',
          shopName: 'shop2',
          shopURL: 'shopurl2',
          items: [],
        },
      ]

      // ページキャッシュのモック
      const loadOrFetchMock = jest.spyOn(pageCache, 'loadOrFetch')
      loadOrFetchMock.mockResolvedValueOnce('<html>product 1 page</html>')
      loadOrFetchMock.mockResolvedValueOnce('<html>product 2 page</html>')

      // Product pageのパース結果をモック
      const parseProductPageMock = jest.spyOn(boothParser, 'parseProductPage')

      parseProductPageMock.mockReturnValueOnce([
        {
          html: '<p>関連: <a href="https://booth.pm/ja/items/333">商品3</a>, <a href="https://booth.pm/ja/items/444">商品4</a></p>',
          text: '関連: 商品3, 商品4 https://booth.pm/ja/items/333 https://booth.pm/ja/items/444',
        },
      ])

      parseProductPageMock.mockReturnValueOnce([
        {
          html: '<p>関連: <a href="https://booth.pm/ja/items/333">商品3</a>, <a href="https://booth.pm/ja/items/555">商品5</a></p>',
          text: '関連: 商品3, 商品5 https://booth.pm/ja/items/333 https://booth.pm/ja/items/555',
        },
      ])

      // ID抽出のモック
      const retrieveIdsMock = jest.spyOn(
        boothParser,
        'retrieveBoothIdsFromHtml'
      )
      retrieveIdsMock.mockReturnValueOnce(['333', '444'])
      retrieveIdsMock.mockReturnValueOnce(['333', '555'])

      const result = await extractIdLinking(
        boothRequest,
        boothParser,
        pageCache,
        mockProducts
      )

      expect(result).toHaveLength(4)
      expect(result).toEqual(
        expect.arrayContaining([
          { from: '111', to: '333' },
          { from: '111', to: '444' },
          { from: '222', to: '333' },
          { from: '222', to: '555' },
        ])
      )
    })

    // 複数回同じIDが出現した場合の重複排除テスト
    test('should not duplicate linking relations', async () => {
      const mockProducts: BoothProduct[] = [
        {
          productId: '111',
          productName: 'Product 1',
          productURL: 'url1',
          thumbnailURL: 'thumb1',
          shopName: 'shop1',
          shopURL: 'shopurl1',
          items: [],
        },
      ]

      // ページキャッシュのモック
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockResolvedValue('<html>product page</html>')

      // Product pageのパース結果をモック - 同じIDが複数回出現
      jest.spyOn(boothParser, 'parseProductPage').mockReturnValue([
        {
          html: '<p>関連1: <a href="https://booth.pm/ja/items/333">商品3</a></p>',
          text: '関連1: 商品3 https://booth.pm/ja/items/333',
        },
        {
          html: '<p>関連2: <a href="https://booth.pm/ja/items/333">商品3</a> 再掲</p>',
          text: '関連2: 商品3 再掲 https://booth.pm/ja/items/333',
        },
      ])

      // ID抽出のモック - 両方とも同じID
      jest
        .spyOn(boothParser, 'retrieveBoothIdsFromHtml')
        .mockReturnValueOnce(['333'])
        .mockReturnValueOnce(['333'])

      const result = await extractIdLinking(
        boothRequest,
        boothParser,
        pageCache,
        mockProducts
      )

      // 重複は排除されるはず
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        from: '111',
        to: '333',
      })
    })
  })

  describe('downloadItems', () => {
    // 商品のダウンロード処理のテスト
    test('should download items for products', async () => {
      // Mock product with items
      const mockProducts: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/ja/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://example.com/shop',
          items: [
            {
              itemId: '67890',
              itemName: 'Item 1.zip',
              downloadURL: 'https://booth.pm/downloadables/67890',
            },
          ],
        },
      ]

      // Mock Environment.getPath
      mockEnvironment.getPath.mockReturnValue(`${tempDir}/12345/67890.zip`)

      // Mock file existence check
      mockFs.existsSync.mockReturnValue(false)

      // Mock cache fetch
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockResolvedValue(Buffer.from('file content'))

      await downloadItems(boothRequest, pageCache, mockProducts)

      // ファイル保存の確認
      expect(mockFs.mkdirSync).toHaveBeenCalled()
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('67890.zip'),
        expect.any(Buffer),
        'binary'
      )
    })

    // 既存ファイルがある場合にダウンロードをスキップするテスト
    test('should skip download if item already exists', async () => {
      // Mock product with items
      const mockProducts: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/ja/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://example.com/shop',
          items: [
            {
              itemId: '67890',
              itemName: 'Item 1.zip',
              downloadURL: 'https://booth.pm/downloadables/67890',
            },
          ],
        },
      ]

      // Mock file already exists
      mockFs.existsSync.mockReturnValue(true)

      await downloadItems(boothRequest, pageCache, mockProducts)

      // キャッシュロードは呼ばれないはず
      expect(pageCache.loadOrFetch).not.toHaveBeenCalled()
      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })

    // 複数アイテムがある場合のダウンロードテスト
    test('should handle multiple items', async () => {
      // Mock product with multiple items
      const mockProducts: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/ja/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://example.com/shop',
          items: [
            {
              itemId: '67890',
              itemName: 'Item 1.zip',
              downloadURL: 'https://booth.pm/downloadables/67890',
            },
            {
              itemId: '67891',
              itemName: 'Item 2.pdf',
              downloadURL: 'https://booth.pm/downloadables/67891',
            },
          ],
        },
      ]

      // 最初のアイテムは存在する、2つ目は存在しない
      mockFs.existsSync
        .mockReturnValueOnce(true) // 1つ目はスキップ
        .mockReturnValueOnce(false) // 2つ目はダウンロード

      // Mock cache fetch
      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockResolvedValue(Buffer.from('file content'))

      await downloadItems(boothRequest, pageCache, mockProducts)

      // 1つだけダウンロード

      expect(pageCache.loadOrFetch).toHaveBeenCalledTimes(1)
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('67891.pdf'),
        expect.any(Buffer),
        'binary'
      )
    })
  })

  // 実際のキャッシュデータでパースが正常に動作するかのテスト
  test('should test with real cache data if available', () => {
    // モックをリセットして実際のファイルシステムにアクセスするための準備
    jest.resetAllMocks()

    // 実データへのアクセスをテスト
    const realCachePath = 'data/cache/library/1.html'
    if (fs.existsSync(realCachePath)) {
      const htmlContent = fs.readFileSync(realCachePath, 'utf8')
      const realParser = new BoothParser()
      const products = realParser.parseLibraryPage(htmlContent)

      // パースが正常に動作することを確認
      expect(Array.isArray(products)).toBe(true)

      // 最低限のプロパティが存在するか確認
      if (products.length > 0) {
        expect(products[0]).toHaveProperty('productId')
        expect(products[0]).toHaveProperty('productName')
      }
    }
  })

  describe('fetchFreeItems', () => {
    beforeEach(() => {
      mockEnvironment.getValue.mockImplementation((key: string) => {
        if (key === 'WISHLIST_IDS') return ''
        return ''
      })
    })

    // 無料アイテムの設定ファイルが存在しない場合のテスト
    test('should handle no free items file and no wishlist', async () => {
      mockFs.existsSync.mockReturnValue(false)

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toEqual([])
    })

    // 無料アイテムの設定ファイルが空の場合のテスト
    test('should return empty array if free items config is empty', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ freeItems: [] }))

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toEqual([])
    })

    // 無料アイテムを正常に取得できる場合のテスト
    test('should fetch free items from config', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          freeItems: ['99999'],
        })
      )

      // Mock product page response
      const mockHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/thumb.jpg">
          </head>
          <body>
            <h1 class="text-text-default">Free Test Item</h1>
            <a href="https://booth.pm/ja/shop/12345">
              <span>Test Shop</span>
            </a>
            <div>
              <span class="text-text-gray700">free_item.zip</span>
              <a href="https://booth.pm/downloadables/11111"></a>
            </div>
          </body>
        </html>
      `

      jest.spyOn(pageCache, 'loadOrFetch').mockResolvedValue(mockHtml)
      jest.spyOn(boothParser, 'parseFreeItemPage').mockReturnValue({
        productId: '99999',
        productName: 'Free Test Item',
        productURL: 'https://booth.pm/ja/items/99999',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Test Shop',
        shopURL: 'https://booth.pm/ja/shop/12345',
        items: [
          {
            itemId: '11111',
            itemName: 'free_item.zip',
            downloadURL: 'https://booth.pm/downloadables/11111',
          },
        ],
      })

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        productId: '99999',
        productName: 'Free Test Item',
        type: 'free',
      })
    })

    // 複数のproductIdを処理する場合のテスト
    test('should handle multiple product IDs', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          freeItems: ['88888', '77777'],
        })
      )

      const mockHtml = '<html>Mock HTML</html>'
      jest.spyOn(pageCache, 'loadOrFetch').mockResolvedValue(mockHtml)
      jest
        .spyOn(boothParser, 'parseFreeItemPage')
        .mockReturnValueOnce({
          productId: '88888',
          productName: 'Another Free Item',
          productURL: 'https://booth.pm/ja/items/88888',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://booth.pm/ja/shop/12345',
          items: [],
        })
        .mockReturnValueOnce({
          productId: '77777',
          productName: 'Second Free Item',
          productURL: 'https://booth.pm/ja/items/77777',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://booth.pm/ja/shop/12345',
          items: [],
        })

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toHaveLength(2)
      expect(result[0].productId).toBe('88888')
      expect(result[1].productId).toBe('77777')
    })

    // 無効な設定項目をスキップするテスト
    test('should skip invalid free item configurations', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          freeItems: [null, '', '77777'],
        })
      )

      const mockHtml = '<html>Mock HTML</html>'
      jest.spyOn(pageCache, 'loadOrFetch').mockResolvedValue(mockHtml)
      jest.spyOn(boothParser, 'parseFreeItemPage').mockReturnValue({
        productId: '77777',
        productName: 'Valid Item',
        productURL: 'https://booth.pm/ja/items/77777',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Test Shop',
        shopURL: 'https://booth.pm/ja/shop/12345',
        items: [],
      })

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toHaveLength(1)
      expect(result[0].productId).toBe('77777')
    })

    // 商品ページの取得に失敗した場合のテスト
    test('should handle failed product page fetch', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          freeItems: ['66666'],
        })
      )

      jest.spyOn(pageCache, 'loadOrFetch').mockResolvedValue('')

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toEqual([])
    })

    // パースに失敗した場合のテスト
    test('should handle failed parsing', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        JSON.stringify({
          freeItems: ['55555'],
        })
      )

      const mockHtml = '<html>Invalid HTML</html>'
      jest.spyOn(pageCache, 'loadOrFetch').mockResolvedValue(mockHtml)
      jest.spyOn(boothParser, 'parseFreeItemPage').mockReturnValue(null)

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toEqual([])
    })

    // 欲しいものリストから無料アイテムを取得するテスト
    test('should fetch free items from wishlist', async () => {
      mockFs.existsSync.mockReturnValue(false)
      mockEnvironment.getValue.mockImplementation((key: string) => {
        if (key === 'WISHLIST_IDS') return 'test123'
        return ''
      })

      // Mock wishlist JSON response for page 1 with items
      const mockWishlistJson1 = {
        items: [
          {
            product: {
              id: 88_888,
              name: 'Wishlist Item 1',
              url: 'https://booth.pm/ja/items/88888',
              images: [{ original: 'https://example.com/thumb.jpg' }],
              shop: { name: 'Shop', url: 'https://shop.booth.pm/' },
            },
          },
        ],
      }

      // Mock wishlist JSON response for page 2 with no items (to end pagination)
      const mockWishlistJson2 = {
        items: [],
      }

      // Mock product page HTML for free item check
      const mockProductHtml = `
        <html>
          <head>
            <meta property="og:image" content="https://example.com/thumb.jpg">
          </head>
          <body>
            <h1 class="text-text-default">Wishlist Item 1</h1>
            <a href="https://booth.pm/ja/shop/12345">
              <span>Shop</span>
            </a>
            <div>
              <a href="https://booth.pm/downloadables/77777"></a>
            </div>
          </body>
        </html>
      `

      jest
        .spyOn(boothRequest, 'getPublicWishlistJson')
        .mockResolvedValueOnce({
          status: 200,
          data: mockWishlistJson1,
        } as any)
        .mockResolvedValueOnce({
          status: 200,
          data: mockWishlistJson2,
        } as any)

      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockImplementation(async (type, _id, _expiry, fetchFunc) => {
          if (type === 'wishlist') {
            return fetchFunc()
          }
          return mockProductHtml
        })

      jest
        .spyOn(boothParser, 'parseWishlistJson')
        .mockReturnValueOnce([
          {
            productId: '88888',
            productName: 'Wishlist Item 1',
            productURL: 'https://booth.pm/ja/items/88888',
            thumbnailURL: 'https://example.com/thumb.jpg',
            shopName: 'Shop',
            shopURL: 'https://shop.booth.pm/',
            items: [],
          },
        ])
        .mockReturnValueOnce([])

      jest.spyOn(boothParser, 'parseFreeItemPage').mockReturnValue({
        productId: '88888',
        productName: 'Wishlist Item 1',
        productURL: 'https://booth.pm/ja/items/88888',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Shop',
        shopURL: 'https://shop.booth.pm/',
        items: [
          {
            itemId: '77777',
            itemName: 'free_item.zip',
            downloadURL: 'https://booth.pm/downloadables/77777',
          },
        ],
      })

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        productId: '88888',
        productName: 'Wishlist Item 1',
        type: 'free',
      })
    })

    // 複数の欲しいものリストURLを処理するテスト
    test('should handle multiple wishlist URLs', async () => {
      mockFs.existsSync.mockReturnValue(false)
      mockEnvironment.getValue.mockImplementation((key: string) => {
        if (key === 'WISHLIST_IDS') {
          return 'list1,list2'
        }
        return ''
      })

      // Mock wishlist responses
      const mockWishlistJson1 = {
        items: [
          {
            product: {
              id: 11_111,
              name: 'Item 1',
              url: 'https://booth.pm/ja/items/11111',
            },
          },
        ],
      }
      const mockWishlistJson2 = {
        items: [
          {
            product: {
              id: 22_222,
              name: 'Item 2',
              url: 'https://booth.pm/ja/items/22222',
            },
          },
        ],
      }
      const mockEmptyWishlist = {
        items: [],
      }

      jest
        .spyOn(boothRequest, 'getPublicWishlistJson')
        .mockResolvedValueOnce({ status: 200, data: mockWishlistJson1 } as any)
        .mockResolvedValueOnce({ status: 200, data: mockEmptyWishlist } as any)
        .mockResolvedValueOnce({ status: 200, data: mockWishlistJson2 } as any)
        .mockResolvedValueOnce({ status: 200, data: mockEmptyWishlist } as any)

      jest
        .spyOn(pageCache, 'loadOrFetch')
        .mockImplementation(async (type, _id, _expiry, fetchFunc) => {
          if (type === 'wishlist') {
            return fetchFunc()
          }
          return '<html>Mock Product Page</html>'
        })

      jest
        .spyOn(boothParser, 'parseWishlistJson')
        .mockReturnValueOnce([
          {
            productId: '11111',
            productName: 'Item 1',
            productURL: 'https://booth.pm/ja/items/11111',
            thumbnailURL: '',
            shopName: '',
            shopURL: '',
            items: [],
          },
        ])
        .mockReturnValueOnce([])
        .mockReturnValueOnce([
          {
            productId: '22222',
            productName: 'Item 2',
            productURL: 'https://booth.pm/ja/items/22222',
            thumbnailURL: '',
            shopName: '',
            shopURL: '',
            items: [],
          },
        ])
        .mockReturnValueOnce([])

      jest.spyOn(boothParser, 'parseFreeItemPage').mockReturnValue({
        productId: '',
        productName: '',
        productURL: '',
        thumbnailURL: '',
        shopName: '',
        shopURL: '',
        items: [{ itemId: '1', itemName: 'free.zip', downloadURL: '' }],
      })

      const result = await fetchFreeItems(boothRequest, boothParser, pageCache)

      expect(result).toHaveLength(2)
    })
  })
})
