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

  test('should generate bidirectional linked list', () => {
    // Use the default mocks from beforeEach for this test
    generateLinkedList()

    expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1)
    const writeCall = mockedFs.writeFileSync.mock.calls[0]
    const generatedMarkdown = writeCall[1] as string

    // Product 1 should have links to both Product 2 (outgoing) and Product 3 (incoming)
    expect(generatedMarkdown).toContain('## Product 1 (111)')
    expect(generatedMarkdown).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )
    expect(generatedMarkdown).toContain(
      '- [Product 3](https://booth.pm/ja/items/333)'
    )

    // Product 2 should have links to both Product 3 (outgoing) and Product 1 (incoming)
    expect(generatedMarkdown).toContain('## Product 2 (222)')
    expect(generatedMarkdown).toContain(
      '- [Product 3](https://booth.pm/ja/items/333)'
    )
    expect(generatedMarkdown).toContain(
      '- [Product 1](https://booth.pm/ja/items/111)'
    )

    // Product 3 should have links to both Product 1 (outgoing) and Product 2 (incoming)
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

    // Product 1 should have outgoing link to Product 2
    expect(generatedMarkdown).toContain('## Product 1 (111)')
    expect(generatedMarkdown).toContain(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )

    // Product 2 should have incoming link from Product 1
    expect(generatedMarkdown).toContain('## Product 2 (222)')
    expect(generatedMarkdown).toContain(
      '- [Product 1](https://booth.pm/ja/items/111)'
    )

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

  test('should not duplicate links when product has both incoming and outgoing to same target', () => {
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

    // Product 1 should only mention Product 2 once despite bidirectional link
    const product1Section = generatedMarkdown.split('## Product 2')[0]
    const product2Links = product1Section.split(
      '- [Product 2](https://booth.pm/ja/items/222)'
    )
    expect(product2Links).toHaveLength(2) // One split = one occurrence

    // Product 2 should only mention Product 1 once despite bidirectional link
    const product2Section = generatedMarkdown.split('## Product 2')[1]
    if (product2Section) {
      const product1Links = product2Section.split(
        '- [Product 1](https://booth.pm/ja/items/111)'
      )
      expect(product1Links).toHaveLength(2) // One split = one occurrence
    }
  })
})
