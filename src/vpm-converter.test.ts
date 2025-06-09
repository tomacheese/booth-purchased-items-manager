import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import fs from 'node:fs'
import { VpmConverter } from './vpm-converter'
import { Environment } from './environment'
import type { BoothProduct } from './booth'

// Mock environment
jest.mock('./environment')
const mockEnvironment = Environment as jest.Mocked<typeof Environment>

// Mock fs
jest.mock('node:fs')
const mockFs = fs as jest.Mocked<typeof fs>

describe('VpmConverter', () => {
  let vpmConverter: VpmConverter
  const mockRepositoryDir = '/tmp/test-vpm-repository'

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock environment methods
    mockEnvironment.getPath.mockReturnValue(mockRepositoryDir)
    mockEnvironment.getBoolean.mockReturnValue(true)

    // Mock file system
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => '')
    mockFs.writeFileSync.mockImplementation(() => {
      // empty implementation
    })
    mockFs.readFileSync.mockReturnValue('{}')
    mockFs.copyFileSync.mockImplementation(() => {
      // empty implementation
    })
    mockFs.statSync.mockReturnValue({
      mtime: new Date('2024-01-01'),
    } as any)

    vpmConverter = new VpmConverter()
  })

  test('should be disabled when VPM_ENABLED is false', () => {
    mockEnvironment.getBoolean.mockReturnValue(false)

    const products: BoothProduct[] = []
    vpmConverter.convertBoothItemsToVpm(products)

    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
  })

  test('should skip products without UnityPackage items', () => {
    const products: BoothProduct[] = [
      {
        productId: '12345',
        productName: 'Test Product',
        productURL: 'https://booth.pm/items/12345',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Test Shop',
        shopURL: 'https://avatarcreator.booth.pm/',
        items: [
          {
            itemId: '1',
            itemName: 'readme.txt',
            downloadURL: 'https://example.com/download/1',
          },
        ],
      },
    ]

    vpmConverter.convertBoothItemsToVpm(products)

    // Should not create any VPM packages
    expect(mockFs.copyFileSync).not.toHaveBeenCalled()
  })

  test('should convert UnityPackage items to VPM format', () => {
    mockEnvironment.getPath
      .mockReturnValueOnce(mockRepositoryDir) // constructor
      .mockReturnValueOnce('/path/to/item.unitypackage') // getItemPath

    mockFs.existsSync
      .mockReturnValueOnce(false) // repository manifest
      .mockReturnValueOnce(true) // UnityPackage file exists
      .mockReturnValueOnce(false) // version directory doesn't exist

    const products: BoothProduct[] = [
      {
        productId: '12345',
        productName: 'VRC Avatar Tool',
        productURL: 'https://booth.pm/items/12345',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Avatar Creator',
        shopURL: 'https://avatarcreator.booth.pm/',
        items: [
          {
            itemId: '1',
            itemName: 'avatar-tool.unitypackage.zip',
            downloadURL: 'https://example.com/download/1',
          },
        ],
      },
    ]

    vpmConverter.convertBoothItemsToVpm(products)

    // Should create directory structure
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('packages/com.booth.avatarcreator.12345'),
      { recursive: true }
    )

    // Should copy the UnityPackage as zip
    expect(mockFs.copyFileSync).toHaveBeenCalled()

    // Should write package.json and repository manifest
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2)
  })

  test('should handle special characters in product names', () => {
    const products: BoothProduct[] = [
      {
        productId: '12345',
        productName: 'VRC Avatar Tool v2.0!',
        productURL: 'https://booth.pm/items/12345',
        thumbnailURL: 'https://example.com/thumb.jpg',
        shopName: 'Avatar Creator',
        shopURL: 'https://avatarcreator.booth.pm/',
        items: [
          {
            itemId: '1',
            itemName: 'avatar-tool.unitypackage.zip',
            downloadURL: 'https://example.com/download/1',
          },
        ],
      },
    ]

    mockEnvironment.getPath
      .mockReturnValueOnce(mockRepositoryDir)
      .mockReturnValueOnce('/path/to/item.unitypackage')

    mockFs.existsSync
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)

    vpmConverter.convertBoothItemsToVpm(products)

    // Package name should be sanitized
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('com.booth.avatarcreator.12345'),
      { recursive: true }
    )
  })

  test('should return repository stats', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(
      JSON.stringify({
        packages: {
          'com.booth.shop1.123': {
            versions: {
              '1.0.0': {},
              '1.1.0': {},
            },
          },
          'com.booth.shop2.456': {
            versions: {
              '2.0.0': {},
            },
          },
        },
      })
    )

    const stats = vpmConverter.getRepositoryStats()

    expect(stats.totalPackages).toBe(2)
    expect(stats.totalVersions).toBe(3)
    expect(stats.packages).toHaveLength(2)
    expect(stats.packages[0].versions).toHaveLength(2)
    expect(stats.packages[1].versions).toHaveLength(1)
  })
})
