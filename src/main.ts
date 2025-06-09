import fs from 'node:fs'
import { BoothParser, BoothProduct, BoothRequest } from './booth'
import { PageCache } from './pagecache'
import { Environment } from './environment'
import { Discord, Logger } from '@book000/node-utils'
import { generateLinkedList } from './generate-linked-list'
import { VpmConverter } from './vpm-converter'

/**
 * 購入済み商品（ライブラリ・ギフト）を全て取得する
 * @param boothRequest BoothRequestインスタンス
 * @param boothParser BoothParserインスタンス
 * @param pageCache PageCacheインスタンス
 * @returns 商品情報配列（type: 'library'|'gift'を含む）
 */
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

/**
 * 各商品の説明文から他Booth商品へのリンク関係（IDペア）を抽出する
 * @param boothRequest BoothRequestインスタンス
 * @param boothParser BoothParserインスタンス
 * @param pageCache PageCacheインスタンス
 * @param products 商品リスト
 * @returns IDリンク配列
 */
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
          // throw new Error(`Failed to fetch product page: ${response.status}`)
          return ''
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

/**
 * 商品リストの各アイテムをダウンロードし保存する
 * @param boothRequest BoothRequestインスタンス
 * @param pageCache PageCacheインスタンス
 * @param products 商品リスト
 * @returns なし
 */
export async function downloadItems(
  boothRequest: BoothRequest,
  pageCache: PageCache,
  products: BoothProduct[]
) {
  const logger = Logger.configure('downloadItems')
  for (const product of products) {
    const { productId, productName, items } = product
    logger.info(
      `Downloading items for product ${productName} [${productId}] (${items.length} items)`
    )
    for (const item of items) {
      logger.info(
        `Downloading item ${item.itemName} [${item.itemId}] (${item.downloadURL})`
      )
      const fileExtension = item.itemName.split('.').pop()
      const itemPath = Environment.getPath(
        'DOWNLOADED_ITEMS_DIR',
        `${productId}/${item.itemId}.${fileExtension}`
      )
      if (fs.existsSync(itemPath)) {
        logger.info(`Item ${itemPath} already exists, skipping...`)
        continue
      }

      const data = await pageCache.loadOrFetch(
        'item',
        item.itemId,
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
      logger.info(`Item ${itemPath} downloaded`)
    }
  }
}

/**
 * メイン処理。ログイン・商品取得・IDリンク抽出・ダウンロード・新規検出・保存・メトリクス表示
 * @returns なし
 */
async function main() {
  const logger = Logger.configure('main')
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

  // UnityPackageアイテムをVPM形式に変換
  const vpmConverter = new VpmConverter()
  vpmConverter.convertBoothItemsToVpm(products)

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

  logger.info(
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
    logger.info('New products:')
    for (const product of newProducts) {
      logger.info(`- ${product.productName} [${product.productId}]`)
    }

    // Save new products
    if (!fs.existsSync(newProductDir)) {
      fs.mkdirSync(newProductDir, { recursive: true })
    }
    fs.writeFileSync(newProductPath, JSON.stringify(newProducts, null, 2))
  }
  if (newItems.length > 0) {
    logger.info('New items:')
    for (const item of newItems) {
      logger.info(`- ${item.itemName} [${item.itemId}]`)
    }

    // Save new items
    if (!fs.existsSync(newItemDir)) {
      fs.mkdirSync(newItemDir, { recursive: true })
    }
    fs.writeFileSync(newItemPath, JSON.stringify(newItems, null, 2))
  }

  // Notify to Discord new products and items
  const discordWebhookUrl = Environment.getValue('DISCORD_WEBHOOK_URL')
  if (discordWebhookUrl) {
    const discord = new Discord({
      webhookUrl: discordWebhookUrl,
    })

    const newProductEmbeds = {
      title: 'New Products',
      fields: newProducts.map((product) => ({
        name: `\`${product.productName}\``,
        value: `https://booth.pm/ja/items/${product.productId}`,
        inline: false,
      })),
    }

    const newItemProductIds = [
      ...new Set(newItems.map((item) => item.product.productId)),
    ]
    const newItemEmbeds = {
      title: 'New Items',
      fields: newItemProductIds.map((productId) => {
        const product = newItems.find(
          (item) => item.product.productId === productId
        )?.product
        const newProductItems = newItems.filter(
          (item) => item.product.productId === productId
        )
        return {
          name: `\`${product?.productName}\``,
          value:
            `https://booth.pm/ja/items/${productId}` +
            '\n\n' +
            newProductItems
              .map((item) => `- ${item.itemName} [${item.itemId}]`)
              .join('\n'),
          inline: false,
        }
      }),
    }

    const embeds = []
    if (newProducts.length > 0) {
      embeds.push(newProductEmbeds)
    }
    if (newItems.length > 0) {
      embeds.push(newItemEmbeds)
    }
    if (newProducts.length > 0 || newItems.length > 0) {
      await discord.sendMessage({
        embeds,
      })
    }
  }

  // Show metrics
  const metrics = pageCache.getMetrics()
  logger.info('PageCache Metrics:')
  logger.info(`  Hit: ${metrics.hit}`)
  logger.info(`  Miss: ${metrics.miss}`)
  logger.info(`  Expired: ${metrics.expired}`)
  logger.info(`  Saved: ${metrics.saved}`)

  logger.info('Generating linked list...')
  generateLinkedList()

  // VPMリポジトリの統計情報を表示
  if (Environment.getBoolean('VPM_ENABLED')) {
    const vpmStats = vpmConverter.getRepositoryStats()
    logger.info('VPM Repository Stats:')
    logger.info(`  Total packages: ${vpmStats.totalPackages}`)
    logger.info(`  Total versions: ${vpmStats.totalVersions}`)
    if (vpmStats.packages.length > 0) {
      logger.info('  Packages:')
      for (const pkg of vpmStats.packages) {
        logger.info(`    - ${pkg.name} (${pkg.versions.length} versions)`)
      }
    }
  }

  logger.info('Done!')
}

if (process.env.NODE_ENV !== 'test') {
  ;(async () => {
    await main()
  })()
}
