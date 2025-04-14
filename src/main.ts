import fs from 'node:fs'
import { BoothParser, BoothProduct, BoothRequest } from './booth'
import { PageCache } from './pagecache'
import { Environment } from './environment'

export async function fetchPurchased(
  boothRequest: BoothRequest,
  boothParser: BoothParser,
  pageCache: PageCache
) {
  const isLoggedIn = await boothRequest.checkLogin()

  if (!isLoggedIn) {
    await boothRequest.login()
  }

  // Library
  const libraryProducts = []
  let pageNumber = 1
  while (true) {
    const html = await pageCache.loadOrFetch(
      'library',
      pageNumber.toString(),
      1,
      async () => {
        const response = await boothRequest.getLibraryPage(pageNumber)
        if (response.status !== 200) {
          throw new Error(`Failed to fetch library page: ${response.status}`)
        }
        return response.data
      }
    )
    const libraryItems = boothParser.parseLibraryPage(html)
    if (libraryItems.length === 0) {
      break
    }
    libraryProducts.push(...libraryItems)
    pageNumber++
  }

  // Gifts
  const giftProducts = []
  pageNumber = 1
  while (true) {
    const html = await pageCache.loadOrFetch(
      'gift',
      pageNumber.toString(),
      1,
      async () => {
        const response = await boothRequest.getLibraryGiftsPage(pageNumber)
        if (response.status !== 200) {
          throw new Error(
            `Failed to fetch library gifts page: ${response.status}`
          )
        }
        return response.data
      }
    )
    const giftItems = boothParser.parseLibraryPage(html)
    if (giftItems.length === 0) {
      break
    }
    giftProducts.push(...giftItems)
    pageNumber++
  }

  // Combine library and gift products
  const products = [
    ...libraryProducts.map((product) => ({ ...product, type: 'library' })),
    ...giftProducts.map((product) => ({ ...product, type: 'gift' })),
  ]

  return products
}

export async function extractIdLinking(
  boothRequest: BoothRequest,
  boothParser: BoothParser,
  pageCache: PageCache,
  products: BoothProduct[]
) {
  const idLinking: {
    from: string
    to: string
  }[] = []
  for (const product of products) {
    const { productId } = product
    const html = await pageCache.loadOrFetch(
      'product',
      productId,
      1,
      async () => {
        const response = await boothRequest.getProductPage(productId)
        if (response.status !== 200) {
          throw new Error(`Failed to fetch product page: ${response.status}`)
        }
        return response.data
      }
    )
    const descriptions = boothParser.parseProductPage(html)

    // get booth url in description
    const boothIds = []
    for (const description of descriptions) {
      const extractedBoothIds =
        boothParser.retrieveBoothIdsFromHtml(description)
      boothIds.push(...extractedBoothIds)
    }

    // unique boothIds
    const uniqueBoothIds = [...new Set(boothIds)]

    for (const boothId of uniqueBoothIds) {
      if (
        idLinking.some((link) => link.from === productId && link.to === boothId)
      ) {
        continue
      }
      idLinking.push({
        from: productId,
        to: boothId,
      })
    }
  }

  return idLinking
}

export async function downloadItems(
  boothRequest: BoothRequest,
  pageCache: PageCache,
  products: BoothProduct[]
) {
  for (const product of products) {
    const { productId, productName, items } = product
    console.log(
      `Downloading items for product ${productName} [${productId}] (${items.length} items)`
    )
    for (const item of items) {
      console.log(
        `Downloading item ${item.itemName} [${item.itemId}] (${item.downloadURL})`
      )
      const fileExtension = item.itemName.split('.').pop()
      const itemPath = Environment.getPath(
        'DOWNLOADED_ITEMS_DIR',
        `${productId}/${item.itemId}.${fileExtension}`
      )
      if (fs.existsSync(itemPath)) {
        console.log(`Item ${itemPath} already exists, skipping...`)
        continue
      }

      const data = await pageCache.loadOrFetch(
        'item',
        productId,
        1,
        async () => {
          const response = await boothRequest.getItem(item.itemId)
          if (response.status !== 200) {
            throw new Error(`Failed to fetch product page: ${response.status}`)
          }
          return response.data
        }
      )

      const itemDir = itemPath.slice(0, Math.max(0, itemPath.lastIndexOf('/')))
      if (!fs.existsSync(itemDir)) {
        fs.mkdirSync(itemDir, { recursive: true })
      }

      // save data
      fs.writeFileSync(itemPath, Buffer.from(data), 'binary')
      console.log(`Item ${itemPath} downloaded`)
    }
  }
}

async function main() {
  const boothRequest = new BoothRequest()
  await boothRequest.login()

  const boothParser = new BoothParser()

  const pageCache = new PageCache()

  const productPath = Environment.getPath('PRODUCTS_PATH')
  const prevProducts: BoothProduct[] = fs.existsSync(productPath)
    ? JSON.parse(fs.readFileSync(productPath, 'utf8'))
    : []

  const products = await fetchPurchased(boothRequest, boothParser, pageCache)

  // Save the products to a file
  fs.writeFileSync(productPath, JSON.stringify(products, null, 2))

  // --- 各商品ページにアクセスし、説明文を取得 ---
  const idLinking = await extractIdLinking(
    boothRequest,
    boothParser,
    pageCache,
    products
  )

  // Save the id mapping to a file
  const idLinkingPath = Environment.getPath('ID_MAPPING_PATH')
  fs.writeFileSync(idLinkingPath, JSON.stringify(idLinking, null, 2))

  // アイテム情報をもとに、アイテムをダウンロードし保存
  await downloadItems(boothRequest, pageCache, products)

  // 新しい商品・アイテムを一覧化
  const newProducts = products.filter((product) => {
    return !prevProducts.some(
      (prevProduct) => prevProduct.productId === product.productId
    )
  })
  const newItems = products.flatMap((product) => {
    if (
      prevProducts.some(
        (prevProduct) => prevProduct.productId === product.productId
      )
    ) {
      return product.items
        .filter((item) => {
          return !prevProducts.some((prevProduct) => {
            return (
              prevProduct.productId === product.productId &&
              prevProduct.items.some(
                (prevItem) => prevItem.itemId === item.itemId
              )
            )
          })
        })
        .map((item) => ({
          ...item,
          product,
        }))
    }
    return []
  })

  console.log(
    `New products: ${newProducts.length}, New items: ${newItems.length}`
  )

  const newProductDir = Environment.getPath('NEW_DIR', 'products/')
  const newItemDir = Environment.getPath('NEW_DIR', 'items/')
  // YYYY-MM-DD_HH-MM-SS
  const datetime = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .slice(0, 19)
    .replace('T', '_')
  const newProductPath = `${newProductDir}${datetime}.json`
  const newItemPath = `${newItemDir}${datetime}.json`

  if (newProducts.length > 0) {
    console.log('New products:')
    for (const product of newProducts) {
      console.log(`- ${product.productName} [${product.productId}]`)
    }

    // Save new products
    if (!fs.existsSync(newProductDir)) {
      fs.mkdirSync(newProductDir, { recursive: true })
    }
    fs.writeFileSync(newProductPath, JSON.stringify(newProducts, null, 2))
  }
  if (newItems.length > 0) {
    console.log('New items:')
    for (const item of newItems) {
      console.log(`- ${item.itemName} [${item.itemId}]`)
    }

    // Save new items
    if (!fs.existsSync(newItemDir)) {
      fs.mkdirSync(newItemDir, { recursive: true })
    }
    fs.writeFileSync(newItemPath, JSON.stringify(newItems, null, 2))
  }

  // Show metrics
  const metrics = pageCache.getMetrics()
  console.log('PageCache Metrics:')
  console.log(`  Hit: ${metrics.hit}`)
  console.log(`  Miss: ${metrics.miss}`)
  console.log(`  Expired: ${metrics.expired}`)
  console.log(`  Saved: ${metrics.saved}`)

  console.log('Done!')
}

if (process.env.NODE_ENV !== 'test') {
  ;(async () => {
    await main()
  })()
}
