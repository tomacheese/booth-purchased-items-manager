import { jest } from '@jest/globals'

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

export const Logger: {
  configure: jest.MockedFunction<any>
} = {
  configure: jest.fn(() => mockLogger),
}

export const Discord: {
  sendMessage: jest.MockedFunction<any>
} = {
  sendMessage: jest.fn(),
}