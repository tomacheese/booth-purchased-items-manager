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

    const outgoingProducts = outgoingIds.flatMap((linkedId) => {
      return products.filter((item) => {
        return item.productId === linkedId
      })
    })

    const incomingProducts = incomingIds.flatMap((linkedId) => {
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
      outgoingLinks: outgoingProducts.map((item) => ({
        productId: item.productId,
        name: item.productName,
        shop: item.shopName,
      })),
      incomingLinks: incomingProducts.map((item) => ({
        productId: item.productId,
        name: item.productName,
        shop: item.shopName,
      })),
    })
  }

  const markdown = results
    .filter(
      (result) =>
        result.outgoingLinks.length > 0 || result.incomingLinks.length > 0
    )
    .map((result) => {
      let output = `## ${result.product.name} (${result.product.productId})\n\n`

      if (result.outgoingLinks.length > 0) {
        output += `### リンク先\n\n`
        output += result.outgoingLinks
          .map(
            (item) =>
              `- [${item.name}](https://booth.pm/ja/items/${item.productId})`
          )
          .join('\n')

        if (result.incomingLinks.length > 0) {
          output += '\n\n'
        }
      }

      if (result.incomingLinks.length > 0) {
        output += `### 被リンク\n\n`
        output += result.incomingLinks
          .map(
            (item) =>
              `- [${item.name}](https://booth.pm/ja/items/${item.productId})`
          )
          .join('\n')
      }

      return output
    })
    .join('\n\n')

  fs.writeFileSync(linkedItemsPath, markdown)
}
