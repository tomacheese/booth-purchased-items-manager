import { generateLinkedList } from './generate-linked-list'
import fs from 'node:fs'
import { Environment } from './environment'

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}))

jest.mock('./environment')

const mockFs = fs as jest.Mocked<typeof fs>
const mockEnvironment = Environment as jest.Mocked<typeof Environment>

describe('generateLinkedList', () => {
  afterEach(() => {
    jest.resetAllMocks()
  })

  // 現在の前方向リンクのみの動作をテスト
  test('should generate forward links only (current behavior)', () => {
    const mockProducts = [
      {
        productId: '111',
        productName: 'Product A',
        shopName: 'Shop A',
        productURL: 'url1',
        thumbnailURL: 'thumb1',
        shopURL: 'shopurl1',
        items: [],
      },
      {
        productId: '222',
        productName: 'Product B',
        shopName: 'Shop B',
        productURL: 'url2',
        thumbnailURL: 'thumb2',
        shopURL: 'shopurl2',
        items: [],
      },
      {
        productId: '333',
        productName: 'Product C',
        shopName: 'Shop C',
        productURL: 'url3',
        thumbnailURL: 'thumb3',
        shopURL: 'shopurl3',
        items: [],
      },
    ]

    const mockIdLinking = [
      { from: '111', to: '222' }, // Product A links to Product B
      { from: '111', to: '333' }, // Product A links to Product C
      { from: '222', to: '333' }, // Product B links to Product C
    ]

    mockEnvironment.getPath
      .mockReturnValueOnce('products.json')
      .mockReturnValueOnce('id_linking.json')
      .mockReturnValueOnce('linked_items.md')

    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    generateLinkedList()

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'linked_items.md',
      expect.stringContaining('## Product A (111)')
    )
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'linked_items.md',
      expect.stringContaining('## Product B (222)')
    )
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'linked_items.md',
      expect.stringContaining('- [Product B](https://booth.pm/ja/items/222)')
    )
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      'linked_items.md',
      expect.stringContaining('- [Product C](https://booth.pm/ja/items/333)')
    )

    const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string

    // Product A should show links to B and C
    expect(writtenContent).toMatch(
      /## Product A \(111\)[\s\S]*?- \[Product B\]/
    )
    expect(writtenContent).toMatch(
      /## Product A \(111\)[\s\S]*?- \[Product C\]/
    )

    // Product B should show links to C
    expect(writtenContent).toMatch(
      /## Product B \(222\)[\s\S]*?- \[Product C\]/
    )
  })

  // 双方向リンクでは逆方向リンクのみの商品も表示される（新動作）
  test('should show products with incoming links (new behavior)', () => {
    const mockProducts = [
      {
        productId: '111',
        productName: 'Product A',
        shopName: 'Shop A',
        productURL: 'url1',
        thumbnailURL: 'thumb1',
        shopURL: 'shopurl1',
        items: [],
      },
      {
        productId: '222',
        productName: 'Product B',
        shopName: 'Shop B',
        productURL: 'url2',
        thumbnailURL: 'thumb2',
        shopURL: 'shopurl2',
        items: [],
      },
    ]

    const mockIdLinking = [
      { from: '111', to: '222' }, // Only Product A links to Product B
    ]

    mockEnvironment.getPath
      .mockReturnValueOnce('products.json')
      .mockReturnValueOnce('id_linking.json')
      .mockReturnValueOnce('linked_items.md')

    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    generateLinkedList()

    const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string

    // Product A should be shown (has outgoing links)
    expect(writtenContent).toContain('## Product A (111)')

    // Product B should NOW be shown in new implementation (has incoming links)
    expect(writtenContent).toContain('## Product B (222)')
    expect(writtenContent).toMatch(
      /## Product B \(222\)[\s\S]*?### Referenced by[\s\S]*?- \[Product A\]/
    )
  })

  // 空のリンクリストの場合のテスト
  test('should handle empty link list', () => {
    const mockProducts = [
      {
        productId: '111',
        productName: 'Product A',
        shopName: 'Shop A',
        productURL: 'url1',
        thumbnailURL: 'thumb1',
        shopURL: 'shopurl1',
        items: [],
      },
    ]

    const mockIdLinking: never[] = []

    mockEnvironment.getPath
      .mockReturnValueOnce('products.json')
      .mockReturnValueOnce('id_linking.json')
      .mockReturnValueOnce('linked_items.md')

    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    generateLinkedList()

    const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string

    // No products should be shown when no links exist
    expect(writtenContent).toBe('')
  })

  // 双方向リンクが表示されることをテスト（新機能）
  test('should show bidirectional links', () => {
    const mockProducts = [
      {
        productId: '111',
        productName: 'Product A',
        shopName: 'Shop A',
        productURL: 'url1',
        thumbnailURL: 'thumb1',
        shopURL: 'shopurl1',
        items: [],
      },
      {
        productId: '222',
        productName: 'Product B',
        shopName: 'Shop B',
        productURL: 'url2',
        thumbnailURL: 'thumb2',
        shopURL: 'shopurl2',
        items: [],
      },
      {
        productId: '333',
        productName: 'Product C',
        shopName: 'Shop C',
        productURL: 'url3',
        thumbnailURL: 'thumb3',
        shopURL: 'shopurl3',
        items: [],
      },
    ]

    const mockIdLinking = [
      { from: '111', to: '222' }, // Product A links to Product B
      { from: '111', to: '333' }, // Product A links to Product C
      { from: '222', to: '333' }, // Product B links to Product C
    ]

    mockEnvironment.getPath
      .mockReturnValueOnce('products.json')
      .mockReturnValueOnce('id_linking.json')
      .mockReturnValueOnce('linked_items.md')

    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    generateLinkedList()

    const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string

    // Product B should now be shown because it has incoming links from A
    expect(writtenContent).toContain('## Product B (222)')

    // Product C should be shown because it has incoming links from A and B
    expect(writtenContent).toContain('## Product C (333)')

    // Product B should show its outgoing links to C
    expect(writtenContent).toMatch(
      /## Product B \(222\)[\s\S]*?### Links to[\s\S]*?- \[Product C\]/
    )

    // Product B should show incoming links from A
    expect(writtenContent).toMatch(
      /## Product B \(222\)[\s\S]*?### Referenced by[\s\S]*?- \[Product A\]/
    )

    // Product C should show incoming links from both A and B
    expect(writtenContent).toMatch(
      /## Product C \(333\)[\s\S]*?### Referenced by[\s\S]*?- \[Product A\]/
    )
    expect(writtenContent).toMatch(
      /## Product C \(333\)[\s\S]*?### Referenced by[\s\S]*?- \[Product B\]/
    )
  })

  // 逆方向リンクのみの商品もテスト（新機能）
  test('should show products with only incoming links', () => {
    const mockProducts = [
      {
        productId: '111',
        productName: 'Product A',
        shopName: 'Shop A',
        productURL: 'url1',
        thumbnailURL: 'thumb1',
        shopURL: 'shopurl1',
        items: [],
      },
      {
        productId: '222',
        productName: 'Product B',
        shopName: 'Shop B',
        productURL: 'url2',
        thumbnailURL: 'thumb2',
        shopURL: 'shopurl2',
        items: [],
      },
    ]

    const mockIdLinking = [
      { from: '111', to: '222' }, // Only Product A links to Product B
    ]

    mockEnvironment.getPath
      .mockReturnValueOnce('products.json')
      .mockReturnValueOnce('id_linking.json')
      .mockReturnValueOnce('linked_items.md')

    mockFs.readFileSync
      .mockReturnValueOnce(JSON.stringify(mockProducts))
      .mockReturnValueOnce(JSON.stringify(mockIdLinking))

    generateLinkedList()

    const writtenContent = mockFs.writeFileSync.mock.calls[0][1] as string

    // Product A should be shown (has outgoing links)
    expect(writtenContent).toContain('## Product A (111)')
    expect(writtenContent).toMatch(
      /## Product A \(111\)[\s\S]*?### Links to[\s\S]*?- \[Product B\]/
    )

    // Product B should now be shown (has incoming links)
    expect(writtenContent).toContain('## Product B (222)')
    expect(writtenContent).toMatch(
      /## Product B \(222\)[\s\S]*?### Referenced by[\s\S]*?- \[Product A\]/
    )
  })
})
