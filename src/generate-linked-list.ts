import { BoothProduct } from './booth'
import fs from 'node:fs'

export function generateLinkedList() {
  const products: BoothProduct[] = JSON.parse(
    fs.readFileSync('data/products.json', 'utf8')
  )
  const idLinking: {
    from: string
    to: string
  }[] = JSON.parse(fs.readFileSync('data/id_linking.json', 'utf8'))

  const results = []
  for (const product of products) {
    const productId = product.productId

    const linkedIds = idLinking
      .filter((link) => link.from === productId)
      .map((link) => link.to)
    const linkedProducts = linkedIds.flatMap((linkedId) => {
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

  fs.writeFileSync('data/linked_items.md', markdown)
}
