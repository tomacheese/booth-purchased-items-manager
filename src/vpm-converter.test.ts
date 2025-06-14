import { describe, test, expect, beforeEach, jest } from '@jest/globals'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { VpmConverter } from './vpm-converter'
import { Environment } from './environment'
import type { BoothProduct } from './booth'
import * as yauzl from 'yauzl'
import * as iconv from 'iconv-lite'

// Mock environment
jest.mock('./environment')
const mockEnvironment = Environment as jest.Mocked<typeof Environment>

// Mock fs
jest.mock('node:fs')
const mockFs = fs as jest.Mocked<typeof fs>

// Mock child_process
jest.mock('node:child_process')
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>

// Mock yauzl
jest.mock('yauzl')
const mockYauzl = yauzl as jest.Mocked<typeof yauzl>

// Mock iconv-lite
jest.mock('iconv-lite')
const mockIconv = iconv as jest.Mocked<typeof iconv>

describe('VpmConverter', () => {
  let vpmConverter: VpmConverter
  const mockRepositoryDir = '/tmp/test-vpm-repository'

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock environment methods
    mockEnvironment.getPath.mockReturnValue(mockRepositoryDir)
    mockEnvironment.getBoolean.mockReturnValue(true)
    mockEnvironment.getValue.mockReturnValue('')

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
    } as fs.Stats)
    mockFs.readdirSync.mockReturnValue([] as fs.Dirent[])
    mockFs.createWriteStream.mockReturnValue({
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          Promise.resolve()
            .then(() => {
              handler()
            })
            .catch(() => {
              // ignore error
            })
        }
        return mockFs.createWriteStream('test')
      }),
    } as unknown as ReturnType<typeof fs.createWriteStream>)

    // Mock execSync
    mockExecSync.mockImplementation((() => Buffer.from('')) as any)

    // Mock yauzl
    mockYauzl.open.mockImplementation(((
      _path: string,
      options: any,
      callback?: any
    ) => {
      const cb =
        typeof options === 'function'
          ? options
          : (callback ?? (() => undefined))
      if (callback || typeof options === 'function') {
        const mockZipfile = {
          readEntry: jest.fn(),
          openReadStream: jest.fn(
            (
              _entry: yauzl.Entry,
              cb: (
                err: Error | null,
                stream: NodeJS.ReadableStream | null
              ) => void
            ) => {
              cb(null, {
                pipe: jest.fn(),
                on: jest.fn(),
              } as unknown as NodeJS.ReadableStream)
            }
          ),
          on: jest.fn((event: string, handler: () => void) => {
            if (event === 'end') {
              Promise.resolve()
                .then(() => {
                  handler()
                })
                .catch(() => {
                  // ignore error
                })
            }
          }),
          close: jest.fn(),
        } as unknown as yauzl.ZipFile
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        cb(null, mockZipfile as unknown as yauzl.ZipFile)
      }
    }) as any)

    vpmConverter = new VpmConverter()
  })

  test('should be disabled when VPM_ENABLED is false', async () => {
    mockEnvironment.getBoolean.mockReturnValue(false)

    const products: BoothProduct[] = []
    await vpmConverter.convertBoothItemsToVpm(products)

    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
  })

  test('should skip products without UnityPackage items', async () => {
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

    await vpmConverter.convertBoothItemsToVpm(products)

    // Should not create any VPM packages
    expect(mockFs.copyFileSync).not.toHaveBeenCalled()
  })

  test('should convert UnityPackage items to VPM format', async () => {
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

    await vpmConverter.convertBoothItemsToVpm(products)

    // Should create directory structure
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('packages/com.booth.avatarcreator.12345'),
      { recursive: true }
    )

    // Should copy the UnityPackage as zip
    expect(mockFs.copyFileSync).toHaveBeenCalled()

    // Should write package.json and repository manifest (repository saved after each package)
    expect(mockFs.writeFileSync).toHaveBeenCalledTimes(3)
  })

  test('should handle special characters in product names', async () => {
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

    await vpmConverter.convertBoothItemsToVpm(products)

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

  describe('ZIP extraction with encoding support', () => {
    test('should handle Japanese filenames with different encodings', async () => {
      const products: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://testshop.booth.pm/',
          items: [
            {
              itemId: '1',
              itemName: 'test.zip',
              downloadURL: 'https://example.com/download/1',
            },
          ],
        },
      ]

      // Mock file paths
      mockEnvironment.getPath
        .mockReturnValueOnce(mockRepositoryDir) // constructor
        .mockReturnValueOnce('/path/to/test.zip') // getItemPath

      mockFs.existsSync
        .mockReturnValueOnce(false) // repository manifest
        .mockReturnValueOnce(true) // ZIP file exists
        .mockReturnValueOnce(false) // extracted directory doesn't exist yet

      // Mock yauzl.open to simulate a ZIP with Japanese filenames
      const mockZipfile = {
        readEntry: jest.fn(),
        openReadStream: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
      }

      mockYauzl.open.mockImplementation(((
        _path: string,
        options: any,
        callback?: any
      ) => {
        const cb =
          typeof options === 'function'
            ? options
            : (callback ?? (() => undefined))
        if (callback || typeof options === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          cb(null, mockZipfile as unknown as yauzl.ZipFile)
        }
      }) as any)

      // Simulate entries with Japanese filenames
      const entries = [
        {
          fileName: Buffer.from('テスト.unitypackage', 'utf8').toString(
            'binary'
          ),
        },
        {
          fileName: Buffer.from('日本語ファイル.unitypackage', 'utf8').toString(
            'binary'
          ),
        },
      ]

      let entryIndex = 0
      ;(mockZipfile.on as jest.Mock).mockImplementation(
        (...args: unknown[]) => {
          const [event, handler] = args as [string, (entry?: unknown) => void]
          if (event === 'entry' && entryIndex < entries.length) {
            // Simulate entry events
            Promise.resolve()
              .then(() => {
                handler(entries[entryIndex])
                entryIndex++
                if (entryIndex < entries.length) {
                  mockZipfile.readEntry()
                }
              })
              .catch(() => {
                // ignore error
              })
          } else if (event === 'end') {
            // Simulate end event
            Promise.resolve()
              .then(() => {
                handler()
              })
              .catch(() => {
                // ignore error
              })
          }
        }
      )

      mockZipfile.readEntry.mockImplementation(() => {
        // Trigger next entry
      })

      mockZipfile.openReadStream.mockImplementation((...args: unknown[]) => {
        const [, callback] = args as [
          yauzl.Entry,
          (err: Error | null, stream: NodeJS.ReadableStream | null) => void,
        ]
        const mockStream = {
          pipe: jest.fn().mockReturnThis(),
          on: jest.fn(),
        }
        callback(null, mockStream as unknown as NodeJS.ReadableStream)
      })

      // Mock iconv decode
      mockIconv.decode.mockImplementation(
        (buffer: Buffer, encoding: string): string => {
          const str = buffer.toString('binary')
          if (encoding === 'utf8') {
            return 'テスト.unitypackage'
          } else if (encoding === 'sjis') {
            return '日本語ファイル.unitypackage'
          }
          return str
        }
      )

      // Mock write stream
      const mockWriteStream = {
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'close') {
            Promise.resolve()
              .then(() => {
                handler()
              })
              .catch(() => {
                // ignore error
              })
          }
          return mockWriteStream
        }),
      }
      mockFs.createWriteStream.mockReturnValue(
        mockWriteStream as unknown as ReturnType<typeof fs.createWriteStream>
      )

      // Mock finding unity packages after extraction
      mockFs.readdirSync.mockReturnValue([
        'テスト.unitypackage',
        '日本語ファイル.unitypackage',
      ] as unknown as fs.Dirent[])

      await vpmConverter.convertBoothItemsToVpm(products)

      // Verify yauzl was used for extraction
      expect(mockYauzl.open).toHaveBeenCalled()
      expect(mockIconv.decode).toHaveBeenCalled()
    })

    test('should fallback to shell unzip when yauzl fails', async () => {
      const products: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://testshop.booth.pm/',
          items: [
            {
              itemId: '1',
              itemName: 'corrupted.zip',
              downloadURL: 'https://example.com/download/1',
            },
          ],
        },
      ]

      mockEnvironment.getPath
        .mockReturnValueOnce(mockRepositoryDir) // constructor
        .mockReturnValueOnce('/path/to/corrupted.zip') // getItemPath

      mockFs.existsSync
        .mockReturnValueOnce(false) // repository manifest
        .mockReturnValueOnce(true) // ZIP file exists
        .mockReturnValueOnce(false) // extracted directory doesn't exist

      // Mock yauzl.open to fail
      mockYauzl.open.mockImplementation((...args: unknown[]) => {
        const [, options, callback] = args as [
          string,
          yauzl.Options | ((err: Error | null, zipfile: yauzl.ZipFile) => void),
          ((err: Error | null, zipfile: yauzl.ZipFile) => void) | undefined,
        ]
        const cb: (err: Error | null, zipfile: yauzl.ZipFile) => void =
          typeof options === 'function'
            ? options
            : (callback ?? (() => undefined))
        if (callback || typeof options === 'function') {
          cb(new Error('Invalid ZIP file'), {} as yauzl.ZipFile)
        }
      })

      // Mock successful shell unzip fallback
      mockExecSync.mockImplementation((() => Buffer.from('')) as any)

      // Mock finding unity packages after fallback extraction
      mockFs.readdirSync
        .mockReturnValueOnce([] as fs.Dirent[]) // First call in findUnityPackageFiles
        .mockReturnValueOnce([
          'extracted.unitypackage',
        ] as unknown as fs.Dirent[]) // After fallback

      await vpmConverter.convertBoothItemsToVpm(products)

      // Verify fallback to execSync was used
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('unzip -q -o'),
        expect.any(Object)
      )
    })

    test('should handle encoding detection for various Japanese encodings', async () => {
      const products: BoothProduct[] = [
        {
          productId: '12345',
          productName: 'Test Product',
          productURL: 'https://booth.pm/items/12345',
          thumbnailURL: 'https://example.com/thumb.jpg',
          shopName: 'Test Shop',
          shopURL: 'https://testshop.booth.pm/',
          items: [
            {
              itemId: '1',
              itemName: 'mixed-encoding.zip',
              downloadURL: 'https://example.com/download/1',
            },
          ],
        },
      ]

      mockEnvironment.getPath
        .mockReturnValueOnce(mockRepositoryDir) // constructor
        .mockReturnValueOnce('/path/to/mixed-encoding.zip') // getItemPath

      mockFs.existsSync
        .mockReturnValueOnce(false) // repository manifest
        .mockReturnValueOnce(true) // ZIP file exists
        .mockReturnValueOnce(false) // extracted directory doesn't exist

      // Mock yauzl for different encoding scenarios
      const mockZipfile = {
        readEntry: jest.fn(),
        openReadStream: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
      }

      mockYauzl.open.mockImplementation(((
        _path: string,
        options: any,
        callback?: any
      ) => {
        const cb =
          typeof options === 'function'
            ? options
            : (callback ?? (() => undefined))
        if (callback || typeof options === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          cb(null, mockZipfile as unknown as yauzl.ZipFile)
        }
      }) as any)

      // Test various encodings
      const testCases = [
        { encoded: 'ひらがな.txt', encoding: 'utf8' },
        { encoded: 'カタカナ.txt', encoding: 'sjis' },
        { encoded: '漢字.txt', encoding: 'cp932' },
        { encoded: '全角英数ＡＢＣ１２３.txt', encoding: 'euc-jp' },
      ]

      // Mock iconv decode to handle different encodings
      mockIconv.decode.mockImplementation(
        (buffer: Buffer, encoding: string): string => {
          const testCase = testCases.find((tc) => tc.encoding === encoding)
          if (testCase) {
            return testCase.encoded
          }
          return buffer.toString()
        }
      )

      // Simulate directory entry
      ;(mockZipfile.on as jest.Mock).mockImplementation(
        (...args: unknown[]) => {
          const [event, handler] = args as [string, (entry?: unknown) => void]
          if (event === 'entry') {
            handler({ fileName: 'test/' })
          } else if (event === 'end') {
            Promise.resolve()
              .then(() => {
                handler()
              })
              .catch(() => {
                // ignore error
              })
          }
        }
      )

      await vpmConverter.convertBoothItemsToVpm(products)

      // Verify encoding detection was attempted
      expect(mockIconv.decode).toHaveBeenCalledWith(expect.any(Buffer), 'utf8')
    })
  })
})
