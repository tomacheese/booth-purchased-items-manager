/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-empty-function */
import { fetchPurchased, extractIdLinking, downloadItems } from './main'
import { BoothRequest, BoothParser, BoothProduct } from './booth'
import { PageCache } from './pagecache'
import { Environment } from './environment'
import fs from 'node:fs'
import axios from 'axios'
import { jest } from '@jest/globals'
import path from 'node:path'
import os from 'node:os'

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
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
})
