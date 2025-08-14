import { BoothProduct } from './booth'
import fs from 'node:fs'
import { Environment } from './environment'

export function generateLinkedList() {
  const productPath = Environment.getPath('PRODUCTS_PATH')
  const idLinkingPath = Environment.getPath('ID_MAPPING_PATH')
  const linkedItemsPath = Environment.getPath('LINKED_ITEMS_PATH')
  const products: BoothProduct[] = JSON.parse(
    fs.readFileSync(productPath, 'utf8')
  )
  const idLinking: {
    from: string
    to: string
  }[] = JSON.parse(fs.readFileSync(idLinkingPath, 'utf8'))

  const results = []
  for (const product of products) {
    const productId = product.productId

    // 順方向リンク（現在の動作）: このproductから他への参照
    const outgoingIds = idLinking
      .filter((link) => link.from === productId)
      .map((link) => link.to)

    // 逆方向リンク（新機能）: 他のproductからこのproductへの参照
    const incomingIds = idLinking
      .filter((link) => link.to === productId)
      .map((link) => link.from)

    // 両方向のIDを統合し、重複を除去
    const allLinkedIds = [...new Set([...outgoingIds, ...incomingIds])]

    const linkedProducts = allLinkedIds.flatMap((linkedId) => {
      return products.filter((item) => {
        return item.productId === linkedId
      })
    })

    results.push({
      product: {
        productId,
        name: product.productName,
        shop: product.shopName,
      },
      linkedItems: linkedProducts.map((item) => ({
        productId: item.productId,
        name: item.productName,
        shop: item.shopName,
      })),
    })
  }

  const markdown = results
    .filter((result) => result.linkedItems.length > 0)
    .map(
      (result) =>
        `## ${result.product.name} (${result.product.productId})\n\n` +
        result.linkedItems
          .map(
            (item) =>
              `- [${item.name}](https://booth.pm/ja/items/${item.productId})`
          )
          .join('\n')
    )
    .join('\n\n')

  fs.writeFileSync(linkedItemsPath, markdown)
}
