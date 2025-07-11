import { jest } from '@jest/globals'

export const Logger = {
  configure: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}