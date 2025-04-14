import fs from 'node:fs'
import { Environment } from './environment'

jest.mock('node:fs')
const mockFs = jest.mocked(fs)

describe('Environment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset process.env for each test
    process.env = {}

    // mock fs.existsSync to always return true by default
    mockFs.existsSync.mockReturnValue(true)
  })

  describe('getPath', () => {
    it('should return default path when environment variable is not set', () => {
      const path = Environment.getPath('PRODUCTS_PATH')
      expect(path).toEqual('data/products.json')
    })

    it('should return custom path when environment variable is set', () => {
      process.env.PRODUCTS_PATH = 'custom/path/products.json'
      const path = Environment.getPath('PRODUCTS_PATH')
      expect(path).toEqual('custom/path/products.json')
    })

    it('should append filename for directory paths', () => {
      const path = Environment.getPath('CACHE_DIR', 'test.html')
      expect(path).toEqual('data/cache/test.html')
    })

    it('should add trailing slash for directory paths if not provided', () => {
      process.env.CACHE_DIR = 'custom/cache'
      const path = Environment.getPath('CACHE_DIR', 'test.html')
      expect(path).toEqual('custom/cache/test.html')
    })

    it('should create parent directory for file paths', () => {
      mockFs.existsSync.mockReturnValue(false)
      Environment.getPath('PRODUCTS_PATH')
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('data', { recursive: true })
    })

    it('should create directory for directory paths', () => {
      mockFs.existsSync.mockReturnValue(false)
      Environment.getPath('CACHE_DIR', 'test.html')
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('data/cache/', {
        recursive: true,
      })
    })

    it('should throw an error when attempting to use filename with a file path', () => {
      expect(() => {
        // @ts-expect-error Testing runtime error, ignoring TypeScript error
        Environment.getPath('PRODUCTS_PATH', 'invalid.json')
      }).toThrow('Filename is not allowed for PRODUCTS_PATH, it is a file path')
    })

    it('should throw an error for undefined environment key', () => {
      expect(() => {
        // @ts-expect-error Testing with invalid key
        Environment.getPath('UNKNOWN_KEY')
      }).toThrow('Environment variable UNKNOWN_KEY is not set')
    })
  })
})
