import fs from 'node:fs'
import { BoothParser, BoothProduct, BoothRequest } from './booth'
import { PageCache } from './pagecache'
import { Environment } from './environment'
import { fetchPurchased, extractIdLinking, downloadItems } from './main'

jest.mock('node:fs')
jest.mock('./environment')

const mockFs = jest.mocked(fs)
const mockEnvironment = jest.mocked(Environment)

describe('main functions', () => {
  describe('fetchPurchased', () => {
    it('should fetch library and gift products and return combined result', async () => {
      // Mock classes and methods
      const boothRequest = {
        getLibraryPage: jest
          .fn()
          .mockResolvedValueOnce({ status: 200, data: 'library-html-page-1' })
          .mockResolvedValueOnce({ status: 200, data: 'library-html-page-2' }),
        getLibraryGiftsPage: jest
          .fn()
          .mockResolvedValueOnce({ status: 200, data: 'gift-html-page-1' })
          .mockResolvedValueOnce({ status: 200, data: 'gift-html-page-2' }),
      } as unknown as BoothRequest

      const mockProduct1 = {
        productId: '1',
        productName: 'Product 1',
        productURL: 'https://booth.pm/ja/items/1',
        thumbnailURL: 'https://example.com/1.jpg',
        shopName: 'Shop 1',
        shopURL: 'https://example.com/shop1',
        items: [],
      }

      const mockProduct2 = {
        productId: '2',
        productName: 'Product 2',
        productURL: 'https://booth.pm/ja/items/2',
        thumbnailURL: 'https://example.com/2.jpg',
        shopName: 'Shop 2',
        shopURL: 'https://example.com/shop2',
        items: [],
      }

      const boothParser = {
        parseLibraryPage: jest
          .fn()
          .mockReturnValueOnce([mockProduct1])
          .mockReturnValueOnce([])
          .mockReturnValueOnce([mockProduct2])
          .mockReturnValueOnce([]),
      } as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      const result = await fetchPurchased(boothRequest, boothParser, pageCache)

      expect(boothRequest.getLibraryPage).toHaveBeenCalledWith(1)
      expect(boothRequest.getLibraryGiftsPage).toHaveBeenCalledWith(1)
      expect(result).toEqual([
        { ...mockProduct1, type: 'library' },
        { ...mockProduct2, type: 'gift' },
      ])
    })

    it('should throw error if library page fetch fails', async () => {
      // Mock classes and methods
      const boothRequest = {
        getLibraryPage: jest.fn().mockResolvedValue({ status: 500 }),
      } as unknown as BoothRequest

      const boothParser = {} as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      await expect(
        fetchPurchased(boothRequest, boothParser, pageCache)
      ).rejects.toThrow('Failed to fetch library page: 500')
    })

    it('should throw error if gift page fetch fails', async () => {
      // Mock classes and methods
      const boothRequest = {
        getLibraryPage: jest
          .fn()
          .mockResolvedValue({ status: 200, data: 'library-html' }),
        getLibraryGiftsPage: jest.fn().mockResolvedValue({ status: 500 }),
      } as unknown as BoothRequest

      const boothParser = {
        parseLibraryPage: jest.fn().mockReturnValue([]),
      } as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      await expect(
        fetchPurchased(boothRequest, boothParser, pageCache)
      ).rejects.toThrow('Failed to fetch library gifts page: 500')
    })
  })

  describe('extractIdLinking', () => {
    it('should extract ID linking from product descriptions', async () => {
      // Prepare mock data
      const products = [
        {
          productId: '1',
          productName: 'Product 1',
          productURL: 'https://booth.pm/ja/items/1',
          thumbnailURL: 'https://example.com/1.jpg',
          shopName: 'Shop 1',
          shopURL: 'https://example.com/shop1',
          items: [],
        },
        {
          productId: '2',
          productName: 'Product 2',
          productURL: 'https://booth.pm/ja/items/2',
          thumbnailURL: 'https://example.com/2.jpg',
          shopName: 'Shop 2',
          shopURL: 'https://example.com/shop2',
          items: [],
        },
      ] as BoothProduct[]

      // Mock classes and methods
      const boothRequest = {
        getProductPage: jest
          .fn()
          .mockResolvedValueOnce({ status: 200, data: 'product-1-html' })
          .mockResolvedValueOnce({ status: 200, data: 'product-2-html' }),
      } as unknown as BoothRequest

      const boothParser = {
        parseProductPage: jest
          .fn()
          .mockReturnValueOnce({
            descriptions: [
              { html: '', text: 'Link to https://booth.pm/ja/items/100' },
            ],
          })
          .mockReturnValueOnce({
            descriptions: [
              {
                html: '',
                text: 'Links to https://booth.pm/ja/items/200 and https://booth.pm/ja/items/300',
              },
            ],
          }),
        retrieveBoothIdsFromHtml: jest
          .fn()
          .mockReturnValueOnce(['100'])
          .mockReturnValueOnce(['200', '300']),
      } as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      const result = await extractIdLinking(
        boothRequest,
        boothParser,
        pageCache,
        products
      )

      expect(boothRequest.getProductPage).toHaveBeenCalledTimes(2)
      expect(boothParser.parseProductPage).toHaveBeenCalledTimes(2)
      expect(boothParser.retrieveBoothIdsFromHtml).toHaveBeenCalledTimes(2)
      expect(result).toEqual([
        { from: '1', to: '100' },
        { from: '2', to: '200' },
        { from: '2', to: '300' },
      ])
    })

    it('should not add duplicate ID linkings', async () => {
      // Prepare mock data
      const products = [
        {
          productId: '1',
          productName: 'Product 1',
          productURL: 'https://booth.pm/ja/items/1',
          thumbnailURL: 'https://example.com/1.jpg',
          shopName: 'Shop 1',
          shopURL: 'https://example.com/shop1',
          items: [],
        },
      ] as BoothProduct[]

      // Mock classes and methods
      const boothRequest = {
        getProductPage: jest
          .fn()
          .mockResolvedValue({ status: 200, data: 'product-html' }),
      } as unknown as BoothRequest

      const boothParser = {
        parseProductPage: jest.fn().mockReturnValue({
          descriptions: [
            { html: '', text: 'Link to https://booth.pm/ja/items/100' },
            { html: '', text: 'Another link to https://booth.pm/ja/items/100' },
          ],
        }),
        retrieveBoothIdsFromHtml: jest
          .fn()
          .mockReturnValueOnce(['100'])
          .mockReturnValueOnce(['100']),
      } as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      const result = await extractIdLinking(
        boothRequest,
        boothParser,
        pageCache,
        products
      )

      expect(result).toEqual([{ from: '1', to: '100' }])
    })

    it('should throw error if product page fetch fails', async () => {
      // Prepare mock data
      const products = [
        {
          productId: '1',
          productName: 'Product 1',
          productURL: 'https://booth.pm/ja/items/1',
          thumbnailURL: 'https://example.com/1.jpg',
          shopName: 'Shop 1',
          shopURL: 'https://example.com/shop1',
          items: [],
        },
      ] as BoothProduct[]

      // Mock classes and methods
      const boothRequest = {
        getProductPage: jest.fn().mockResolvedValue({ status: 500 }),
      } as unknown as BoothRequest

      const boothParser = {} as unknown as BoothParser

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      await expect(
        extractIdLinking(boothRequest, boothParser, pageCache, products)
      ).rejects.toThrow('Failed to fetch product page: 500')
    })
  })

  describe('downloadItems', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      mockEnvironment.getPath = jest.fn().mockReturnValue('path/to/item.zip')
    })

    it('should download items for products', async () => {
      // Prepare mock data
      const mockProduct = {
        productId: '1',
        productName: 'Product 1',
        productURL: 'https://booth.pm/ja/items/1',
        thumbnailURL: 'https://example.com/1.jpg',
        shopName: 'Shop 1',
        shopURL: 'https://example.com/shop1',
        items: [
          {
            itemId: '100',
            itemName: 'item.zip',
            downloadURL: 'https://example.com/item.zip',
          },
        ],
      } as unknown as BoothProduct

      // Mock classes and methods
      const boothRequest = {
        getItem: jest
          .fn()
          .mockResolvedValue({ status: 200, data: Buffer.from('item data') }),
      } as unknown as BoothRequest

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      mockFs.existsSync = jest.fn().mockReturnValue(false)
      mockFs.mkdirSync = jest.fn()
      mockFs.writeFileSync = jest.fn()

      await downloadItems(boothRequest, pageCache, [mockProduct])

      expect(boothRequest.getItem).toHaveBeenCalledWith('100')
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'path/to/item.zip',
        expect.any(Buffer),
        'binary'
      )
    })

    it('should skip items that already exist', async () => {
      // Prepare mock data
      const mockProduct = {
        productId: '1',
        productName: 'Product 1',
        productURL: 'https://booth.pm/ja/items/1',
        thumbnailURL: 'https://example.com/1.jpg',
        shopName: 'Shop 1',
        shopURL: 'https://example.com/shop1',
        items: [
          {
            itemId: '100',
            itemName: 'item.zip',
            downloadURL: 'https://example.com/item.zip',
          },
        ],
      } as unknown as BoothProduct

      // Mock classes and methods
      const boothRequest = {
        getItem: jest.fn(),
      } as unknown as BoothRequest

      const pageCache = {
        loadOrFetch: jest.fn(),
      } as unknown as PageCache

      mockFs.existsSync = jest.fn().mockReturnValue(true)
      mockFs.writeFileSync = jest.fn()

      await downloadItems(boothRequest, pageCache, [mockProduct])

      expect(boothRequest.getItem).not.toHaveBeenCalled()
      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })

    it('should create parent directory if it does not exist', async () => {
      // Prepare mock data
      const mockProduct = {
        productId: '1',
        productName: 'Product 1',
        productURL: 'https://booth.pm/ja/items/1',
        thumbnailURL: 'https://example.com/1.jpg',
        shopName: 'Shop 1',
        shopURL: 'https://example.com/shop1',
        items: [
          {
            itemId: '100',
            itemName: 'item.zip',
            downloadURL: 'https://example.com/item.zip',
          },
        ],
      } as unknown as BoothProduct

      // Mock classes and methods
      const boothRequest = {
        getItem: jest
          .fn()
          .mockResolvedValue({ status: 200, data: Buffer.from('item data') }),
      } as unknown as BoothRequest

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      mockFs.existsSync = jest
        .fn()
        .mockReturnValueOnce(false) // For item path check
        .mockReturnValueOnce(false) // For directory check
      mockFs.mkdirSync = jest.fn()
      mockFs.writeFileSync = jest.fn()

      await downloadItems(boothRequest, pageCache, [mockProduct])

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('path/to', {
        recursive: true,
      })
    })

    it('should throw error if item fetch fails', async () => {
      // Prepare mock data
      const mockProduct = {
        productId: '1',
        productName: 'Product 1',
        productURL: 'https://booth.pm/ja/items/1',
        thumbnailURL: 'https://example.com/1.jpg',
        shopName: 'Shop 1',
        shopURL: 'https://example.com/shop1',
        items: [
          {
            itemId: '100',
            itemName: 'item.zip',
            downloadURL: 'https://example.com/item.zip',
          },
        ],
      } as unknown as BoothProduct

      // Mock classes and methods
      const boothRequest = {
        getItem: jest.fn().mockResolvedValue({ status: 500 }),
      } as unknown as BoothRequest

      const pageCache = {
        loadOrFetch: jest
          .fn()
          .mockImplementation((_type, _id, _expireDays, fetchFunc) => {
            return fetchFunc()
          }),
      } as unknown as PageCache

      mockFs.existsSync = jest.fn().mockReturnValue(false)

      await expect(
        downloadItems(boothRequest, pageCache, [mockProduct])
      ).rejects.toThrow('Failed to fetch product page: 500')
    })
  })
})
