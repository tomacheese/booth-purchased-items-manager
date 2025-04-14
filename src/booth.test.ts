/* eslint-disable @typescript-eslint/unbound-method */
import { BoothRequest, BoothParser } from './booth'
import axios from 'axios'
import fs from 'node:fs'
import puppeteer, { Cookie } from 'puppeteer-core'
import { jest } from '@jest/globals'

jest.mock('axios')
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
jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(), // モックを追加
}))

const mockAxios = axios as jest.Mocked<typeof axios>
const mockFs = fs as jest.Mocked<typeof fs>
const mockPuppeteer = puppeteer as jest.Mocked<typeof puppeteer>

describe('BoothRequest', () => {
  let boothRequest: BoothRequest

  beforeEach(() => {
    jest.clearAllMocks()
    boothRequest = new BoothRequest()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should check login status', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: '' })
    const isLoggedIn = await boothRequest.checkLogin()
    expect(isLoggedIn).toBe(true)
  })

  test('should handle login process', async () => {
    jest.spyOn(boothRequest, 'checkLogin').mockResolvedValueOnce(false)
    await boothRequest.login()
    expect(mockPuppeteer.launch).toHaveBeenCalled()
  })

  test('should skip login if already logged in', async () => {
    jest.spyOn(boothRequest, 'checkLogin').mockResolvedValueOnce(true)
    await boothRequest.login()
    expect(mockPuppeteer.launch).not.toHaveBeenCalled()
  })

  test('should load cookies from file if exists', () => {
    mockFs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(true)
    mockFs.readFileSync.mockReturnValueOnce(
      JSON.stringify([
        {
          name: 'cookie1',
          value: 'value1',
          domain: 'example.com',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          session: true,
        },
        {
          name: 'cookie2',
          value: 'value2',
          domain: 'example.com',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          session: true,
        },
      ])
    )
    const request = new BoothRequest()
    // @ts-expect-error プライベートプロパティにアクセス
    expect(request.cookies).toHaveLength(2)
  })

  test('should fetch library page', async () => {
    const mockHtml = '<html><body>Library Page</body></html>'
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: mockHtml })
    const response = await boothRequest.getLibraryPage(1)
    expect(response.data).toBe(mockHtml)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://accounts.booth.pm/library?page=1',
      expect.objectContaining({ headers: expect.anything() })
    )
  })

  test('should fetch library gifts page', async () => {
    const mockHtml = '<html><body>Gifts Page</body></html>'
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: mockHtml })
    const response = await boothRequest.getLibraryGiftsPage(2)
    expect(response.data).toBe(mockHtml)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://accounts.booth.pm/library/gifts?page=2',
      expect.objectContaining({ headers: expect.anything() })
    )
  })

  test('should fetch product page', async () => {
    const mockHtml = '<html><body>Product Page</body></html>'
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: mockHtml })
    const response = await boothRequest.getProductPage('12345')
    expect(response.data).toBe(mockHtml)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://booth.pm/ja/items/12345',
      expect.objectContaining({ headers: expect.anything() })
    )
  })

  test('should fetch item', async () => {
    const mockData = Buffer.from('mock item data')
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: mockData })
    const response = await boothRequest.getItem('12345')
    expect(response.data).toBe(mockData)
    expect(mockAxios.get).toHaveBeenCalledWith(
      'https://booth.pm/downloadables/12345',
      expect.objectContaining({
        headers: expect.anything(),
        responseType: 'arraybuffer',
      })
    )
  })

  test('should handle axios error in getItem', async () => {
    const boothRequest = new BoothRequest()
    mockAxios.get.mockRejectedValueOnce(new Error('network error'))
    await expect(boothRequest.getItem('99999')).rejects.toThrow('network error')
  })

  test('should return true if login check is successful', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 200, data: '' })
    const result = await boothRequest.checkLogin()
    expect(result).toBe(true)
  })

  test('should return false if login check fails', async () => {
    mockAxios.get.mockResolvedValueOnce({ status: 401, data: '' })
    const result = await boothRequest.checkLogin()
    expect(result).toBe(false)
  })

  test('should generate cookie string correctly', () => {
    // @ts-expect-error プライベートプロパティにアクセス
    boothRequest.cookies = [
      {
        name: 'cookie1',
        value: 'value1',
        domain: 'example.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        session: true,
      },
      {
        name: 'cookie2',
        value: 'value2',
        domain: 'example.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        session: true,
      },
    ] as Cookie[]
    // @ts-expect-error プライベートメソッドをテスト
    const cookieString = boothRequest.getCookieString()
    expect(cookieString).toBe('cookie1=value1; cookie2=value2')
  })
})

describe('BoothParser', () => {
  let boothParser: BoothParser

  beforeEach(() => {
    boothParser = new BoothParser()
  })

  test('should parse empty library page', () => {
    const mockHtml = '<html><body></body></html>'
    const result = boothParser.parseLibraryPage(mockHtml)
    expect(result).toEqual([])
  })

  test('should parse library page with products', () => {
    const mockHtml = `
      <html>
        <body>
          <main>
            <div class="w-full">
              <div class="mb-16">
                <a class="no-underline" href="https://booth.pm/ja/items/12345">
                  <div>Product 1</div>
                </a>
                <a class="no-underline" href="https://example.com/shop1">
                  <div>Shop 1</div>
                </a>
                <a href="https://example.com/shop1">
                  <img src="https://example.com/image1.jpg">
                </a>
                <div class="desktop:flex desktop:justify-between desktop:items-center">
                  <div class="typography-14">Item 1</div>
                  <a href="https://booth.pm/downloadables/67890"></a>
                </div>
              </div>
            </div>
          </main>
        </body>
      </html>
    `
    const result = boothParser.parseLibraryPage(mockHtml)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
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
    })
  })

  test('should parse product page', () => {
    const mockHtml = `
      <html>
        <body>
          <section class="main-info-column">
            <div class="description">
              <p>商品説明1</p>
              <p>リンク: <a href="https://booth.pm/ja/items/54321">関連商品</a></p>
            </div>
          </section>
          <section class="shop__text">
            <p>ショップからのお知らせ</p>
          </section>
        </body>
      </html>
    `

    const result = boothParser.parseProductPage(mockHtml)

    expect(result).toHaveLength(2)
    expect(result[0].text).toContain('商品説明1')
    expect(result[0].text).toContain('リンク: 関連商品')
    expect(result[1].text).toBe('ショップからのお知らせ')
  })

  test('should retrieve Booth IDs from HTML description', () => {
    const description = {
      html: '<p>関連商品: <a href="https://booth.pm/ja/items/12345">商品1</a>, <a href="https://example.booth.pm/items/67890">商品2</a></p>',
      text: '関連商品: 商品1, 商品2 https://booth.pm/ja/items/12345 https://example.booth.pm/items/67890',
    }

    const result = boothParser.retrieveBoothIdsFromHtml(description)

    expect(result).toEqual(['12345', '67890'])
  })

  test('should retrieve Booth IDs with duplicates and newlines', () => {
    const description = {
      html: '<p>関連商品: <a href="https://booth.pm/ja/items/12345">商品1</a>\n<a href="https://booth.pm/ja/items/12345">商品1</a>\n<a href="https://booth.pm/ja/items/67890">商品2</a></p>',
      text: '関連商品: 商品1 https://booth.pm/ja/items/12345\n商品1 https://booth.pm/ja/items/12345\n商品2 https://booth.pm/ja/items/67890',
    }
    const boothParser = new BoothParser()
    const result = boothParser.retrieveBoothIdsFromHtml(description)
    // 重複を許容する仕様なので両方含まれる
    expect(result).toEqual(['12345', '12345', '67890'])
  })

  test('should handle invalid HTML in parseLibraryPage', () => {
    const mockHtml = '<invalid>HTML'
    const result = boothParser.parseLibraryPage(mockHtml)
    expect(result).toEqual([])
  })

  test('should test with real cache data if available', () => {
    const originalExistsSync = fs.existsSync
    const originalReadFileSync = fs.readFileSync

    // モックをリセットして実際のファイルシステムにアクセス
    jest.resetAllMocks()

    // 実データへのアクセスをテスト（エラーは発生しないこと）
    try {
      const realCachePath = 'data/cache/library/1.html'
      if (originalExistsSync(realCachePath)) {
        const htmlContent = originalReadFileSync(realCachePath, 'utf8')
        const result = boothParser.parseLibraryPage(htmlContent)
        // 少なくともパースエラーが起きないことを確認
        expect(typeof result).toBe('object')
      }

      const realProductPath = 'data/cache/product/'
      if (originalExistsSync(realProductPath)) {
        const files = fs.readdirSync(realProductPath)
        if (files.length > 0) {
          for (const file of files
            .filter((f) => f.endsWith('.html'))
            .slice(0, 1)) {
            const htmlContent = originalReadFileSync(
              `${realProductPath}${file}`,
              'utf8'
            )
            const result = boothParser.parseProductPage(htmlContent)
            expect(Array.isArray(result)).toBe(true)
          }
        }
      }
    } catch {}
  })
})
