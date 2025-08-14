import { generateLinkedList } from './generate-linked-list'
import { BoothProduct } from './booth'
import fs from 'node:fs'
import { Environment } from './environment'

// Mock dependencies
jest.mock('node:fs')
jest.mock('./environment')

const mockedFs = fs as jest.Mocked<typeof fs>
const mockedEnvironment = Environment as jest.Mocked<typeof Environment>

describe('generateLinkedList', () => {
  const mockProducts: BoothProduct[] = [
    {
      productId: '111',
      productName: 'Product 1',
      productURL: 'url1',
      thumbnailURL: 'thumb1',
      shopName: 'Shop A',
      shopURL: 'shopurl1',
      items: [],
    },
    {
      productId: '222',
      productName: 'Product 2',
      productURL: 'url2',
      thumbnailURL: 'thumb2',
      shopName: 'Shop B',
      shopURL: 'shopurl2',
      items: [],
    },
    {
      productId: '333',
      productName: 'Product 3',
      productURL: 'url3',
      thumbnailURL: 'thumb3',
      shopName: 'Shop C',
      shopURL: 'shopurl3',
      items: [],
    },
  ]

  const mockIdLinking = [
    { from: '111', to: '222' }, // Product 1 → Product 2
    { from: '222', to: '333' }, // Product 2 → Product 3
    { from: '333', to: '111' }, // Product 3 → Product 1
  ]

  beforeEach(() => {
    jest.resetAllMocks()

    // Mock Environment.getPath
    mockedEnvironment.getPath
      .mockReturnValueOnce('/mock/products.json')
      .mockReturnValueOnce('/mock/id_linking.json')
      .mockReturnValueOnce('/mock/linked_items.md')

    // Mock fs.readFileSync
    mockedFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    // Mock fs.writeFileSync
    mockedFs.writeFileSync.mockImplementation(() => {
      // Empty function
    })
  })

  test('should generate bidirectional linked list with separate sections', () => {
    // Use the default mocks from beforeEach for this test
    generateLinkedList()

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1)
    const writeCall = mockedFs.writeFileSync.mock.calls[0]
    const generatedMarkdown = writeCall[1] as string

    // Product 1 should have outgoing link to Product 2 and incoming link from Product 3
    expect(generatedMarkdown).toContain('## Product 1 (111)')
    expect(generatedMarkdown).toContain('### リンク先')
    expect(generatedMarkdown).toContain('### 被リンク')
    expect(generatedMarkdown).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )
    expect(generatedMarkdown).toContain(
      '- [Product 3](https://booth.pm/ja/items/333)'
    )

    // Product 2 should have outgoing link to Product 3 and incoming link from Product 1
    expect(generatedMarkdown).toContain('## Product 2 (222)')
    expect(generatedMarkdown).toContain(
      '- [Product 3](https://booth.pm/ja/items/333)'
    )
    expect(generatedMarkdown).toContain(
      '- [Product 1](https://booth.pm/ja/items/111)'
    )

    // Product 3 should have outgoing link to Product 1 and incoming link from Product 2
    expect(generatedMarkdown).toContain('## Product 3 (333)')
    expect(generatedMarkdown).toContain(
      '- [Product 1](https://booth.pm/ja/items/111)'
    )
    expect(generatedMarkdown).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )
  })

  test('should handle products with only outgoing links', () => {
    const mockIdLinkingOneWay = [
      { from: '111', to: '222' }, // Product 1 → Product 2
    ]

    // Clear all mocks before the test
    jest.resetAllMocks()

    // Set up fresh mocks for this test
    mockedEnvironment.getPath
      .mockReturnValueOnce('/mock/products.json')
      .mockReturnValueOnce('/mock/id_linking.json')
      .mockReturnValueOnce('/mock/linked_items.md')

    mockedFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinkingOneWay))

    mockedFs.writeFileSync.mockImplementation(() => {
      // Empty function
    })

    generateLinkedList()

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1)
    const writeCall = mockedFs.writeFileSync.mock.calls[0]
    const generatedMarkdown = writeCall[1] as string

    // Product 1 should have only outgoing link to Product 2, no incoming links
    expect(generatedMarkdown).toContain('## Product 1 (111)')
    expect(generatedMarkdown).toContain('### リンク先')
    expect(generatedMarkdown).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )

    // Check that Product 1 section doesn't have incoming links
    const product1Section = generatedMarkdown.split('## Product 2')[0]
    expect(product1Section).not.toContain('### 被リンク')

    // Product 2 should have only incoming link from Product 1, no outgoing links
    expect(generatedMarkdown).toContain('## Product 2 (222)')
    expect(generatedMarkdown).toContain('### 被リンク')
    expect(generatedMarkdown).toContain(
      '- [Product 1](https://booth.pm/ja/items/111)'
    )

    // Check that Product 2 section doesn't have outgoing links
    const product2Section = generatedMarkdown.split('## Product 2')[1]
    expect(product2Section).not.toContain('### リンク先')

    // Product 3 should not appear (no links)
    expect(generatedMarkdown).not.toContain('## Product 3 (333)')
  })

  test('should handle products with no links', () => {
    const mockIdLinkingEmpty: { from: string; to: string }[] = []

    // Clear all mocks before the test
    jest.resetAllMocks()

    // Set up fresh mocks for this test
    mockedEnvironment.getPath
      .mockReturnValueOnce('/mock/products.json')
      .mockReturnValueOnce('/mock/id_linking.json')
      .mockReturnValueOnce('/mock/linked_items.md')

    mockedFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinkingEmpty))

    mockedFs.writeFileSync.mockImplementation(() => {
      // Empty function
    })

    generateLinkedList()

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1)
    const writeCall = mockedFs.writeFileSync.mock.calls[0]
    const generatedMarkdown = writeCall[1] as string

    // Should be empty string since no products have links
    expect(generatedMarkdown).toBe('')
  })

  test('should not duplicate links when product has bidirectional relationship', () => {
    const mockIdLinkingDuplicate = [
      { from: '111', to: '222' }, // Product 1 → Product 2
      { from: '222', to: '111' }, // Product 2 → Product 1 (creates bidirectional link)
    ]

    // Clear all mocks before the test
    jest.resetAllMocks()

    // Set up fresh mocks for this test
    mockedEnvironment.getPath
      .mockReturnValueOnce('/mock/products.json')
      .mockReturnValueOnce('/mock/id_linking.json')
      .mockReturnValueOnce('/mock/linked_items.md')

    mockedFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinkingDuplicate))

    mockedFs.writeFileSync.mockImplementation(() => {
      // Empty function
    })

    generateLinkedList()

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1)
    const writeCall = mockedFs.writeFileSync.mock.calls[0]
    const generatedMarkdown = writeCall[1] as string

    // Product 1 should have outgoing link to Product 2 and incoming link from Product 2
    expect(generatedMarkdown).toContain('## Product 1 (111)')
    expect(generatedMarkdown).toContain('### リンク先')
    expect(generatedMarkdown).toContain('### 被リンク')

    // Check that Product 2 appears once in each section for Product 1
    const product1Section = generatedMarkdown.split('## Product 2')[0]
    const outgoingSection = product1Section
      .split('### リンク先')[1]
      .split('### 被リンク')[0]
    const incomingSection = product1Section.split('### 被リンク')[1]

    expect(outgoingSection).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )
    expect(incomingSection).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )

    // Product 2 should have outgoing link to Product 1 and incoming link from Product 1
    expect(generatedMarkdown).toContain('## Product 2 (222)')
    const product2Section = generatedMarkdown.split('## Product 2')[1]
    if (product2Section) {
      expect(product2Section).toContain('### リンク先')
      expect(product2Section).toContain('### 被リンク')
      expect(product2Section).toContain(
        '- [Product 1](https://booth.pm/ja/items/111)'
      )
    }
  })
})
