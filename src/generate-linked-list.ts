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

    // Forward links: products this product links to
    const linkedIds = idLinking
      .filter((link) => link.from === productId)
      .map((link) => link.to)
    const linkedProducts = linkedIds.flatMap((linkedId) => {
      return products.filter((item) => {
        return item.productId === linkedId
      })
    })

    // Backward links: products that link to this product
    const backlinkedIds = idLinking
      .filter((link) => link.to === productId)
      .map((link) => link.from)
    const backlinkedProducts = backlinkedIds.flatMap((backlinkedId) => {
      return products.filter((item) => {
        return item.productId === backlinkedId
      })
    })

    // Include products that have either forward or backward links
    if (linkedProducts.length > 0 || backlinkedProducts.length > 0) {
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
        referencedByItems: backlinkedProducts.map((item) => ({
          productId: item.productId,
          name: item.productName,
          shop: item.shopName,
        })),
      })
    }
  }

  const markdown = results
    .map((result) => {
      let content = `## ${result.product.name} (${result.product.productId})\n\n`

      // Add forward links section
      if (result.linkedItems.length > 0) {
        content += '### Links to\n\n'
        content += result.linkedItems
          .map(
            (item) =>
              `- [${item.name}](https://booth.pm/ja/items/${item.productId})`
          )
          .join('\n')
        content += '\n\n'
      }

      // Add backward links section
      if (result.referencedByItems.length > 0) {
        content += '### Referenced by\n\n'
        content += result.referencedByItems
          .map(
            (item) =>
              `- [${item.name}](https://booth.pm/ja/items/${item.productId})`
          )
          .join('\n')
        content += '\n\n'
      }

      return content.trim()
    })
    .join('\n\n')

  fs.writeFileSync(linkedItemsPath, markdown)
}
