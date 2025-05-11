import puppeteer, { Cookie, LaunchOptions } from 'puppeteer-core'
import fs from 'node:fs'
import axios from 'axios'
import { parse as parseHtml } from 'node-html-parser'
import { Environment } from './environment'

export interface BoothProductItem {
  itemId: string
  itemName: string
  downloadURL: string
}

export interface BoothProduct {
  productId: string
  productName: string
  productURL: string
  thumbnailURL: string
  shopName: string
  shopURL: string
  items: BoothProductItem[]
}

export class BoothRequest {
  private cookiesPath = Environment.getPath('COOKIE_PATH')
  private cookies: Cookie[] = []

  /**
   * BoothRequestのインスタンスを生成し、クッキーが存在すれば読み込む
   */
  constructor() {
    if (fs.existsSync(this.cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf8'))
      this.cookies = cookies
    }
  }

  /**
   * ユーザーがログインしていなければPuppeteerでログイン処理を行い、クッキーを保存する
   * @returns ログイン処理のPromise
   */
  async login() {
    if (await this.checkLogin()) {
      return
    }
    const puppeteerArguments = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--lang=ja',
      '--window-size=1920,1080',
    ]
    const puppeteerOptions: LaunchOptions = {
      headless: Environment.getBoolean('IS_HEADLESS'),
      args: puppeteerArguments,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    }

    const chromiumPath = Environment.getValue('CHROMIUM_PATH')
    if (chromiumPath) {
      puppeteerOptions.executablePath = chromiumPath
    } else {
      puppeteerOptions.channel = 'chrome'
    }
    const browser = await puppeteer.launch(puppeteerOptions)

    const isIgnoreCookie = Environment.getBoolean('IS_IGNORE_COOKIE')
    const cookiePath = Environment.getPath('COOKIE_PATH')
    if (!isIgnoreCookie && fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'))
      for (const cookie of cookies) {
        await browser.setCookie(cookie)
      }
    }

    const page = await browser.newPage()
    const url = 'https://accounts.booth.pm/settings'
    await page.goto(url, {
      waitUntil: 'networkidle2',
    })

    if (page.url() === 'https://accounts.booth.pm/users/sign_in') {
      console.warn('Required login')

      await new Promise((resolve) => {
        // 元のページに戻るまで待つ
        const interval = setInterval(() => {
          const currentUrl = page.url()
          if (currentUrl === url) {
            clearInterval(interval)
            resolve(true)
          }
        }, 1000)
      })
    }

    await page.close()

    const cookies = await browser.cookies()
    fs.writeFileSync(cookiePath, JSON.stringify(cookies))

    this.cookies = cookies
    await browser.close()
  }

  /**
   * Boothにログインしているかどうかを判定する
   * @returns ログイン済みならtrue、未ログインならfalse
   */
  async checkLogin() {
    try {
      const url = 'https://accounts.booth.pm/settings'
      const response = await axios.get<string>(url, {
        headers: {
          Cookie: this.getCookieString(),
        },
        maxRedirects: 0,
        validateStatus: () => true,
      })
      return response.status === 200
    } catch (error) {
      console.error('Error in checkLogin:', error)
      return false
    }
  }

  /**
   * 指定ページ番号のライブラリページHTMLを取得する
   * @param pageNumber ページ番号
   * @returns ライブラリページのレスポンス
   */
  async getLibraryPage(pageNumber: number) {
    const url = `https://accounts.booth.pm/library?page=${pageNumber}`
    const response = await axios.get<string>(url, {
      headers: {
        Cookie: this.getCookieString(),
      },
    })
    return response
  }

  /**
   * 指定ページ番号のギフトページHTMLを取得する
   * @param pageNumber ページ番号
   * @returns ギフトページのレスポンス
   */
  async getLibraryGiftsPage(pageNumber: number) {
    const url = `https://accounts.booth.pm/library/gifts?page=${pageNumber}`
    const response = await axios.get<string>(url, {
      headers: {
        Cookie: this.getCookieString(),
      },
    })
    return response
  }

  /**
   * 指定商品IDの商品ページHTMLを取得する
   * @param productId 商品ID
   * @returns 商品ページのレスポンス
   */
  async getProductPage(productId: string) {
    const url = `https://booth.pm/ja/items/${productId}`
    const response = await axios.get<string>(url, {
      headers: {
        Cookie: this.getCookieString(),
      },
      validateStatus: () => true,
    })
    return response
  }

  /**
   * 指定アイテムIDのダウンロードデータを取得する
   * @param itemId アイテムID
   * @returns アイテムデータのレスポンス
   */
  async getItem(itemId: string) {
    const url = `https://booth.pm/downloadables/${itemId}`
    const response = await axios.get<ArrayBuffer>(url, {
      headers: {
        Cookie: this.getCookieString(),
      },
      responseType: 'arraybuffer',
    })
    return response
  }

  /**
   * 保持しているクッキー情報をCookieヘッダー用文字列に変換する（内部利用）
   * @returns Cookieヘッダー用文字列
   */
  private getCookieString() {
    return this.cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }
}

export class BoothParser {
  /**
   * ライブラリ/ギフトページのHTMLから商品情報リストを抽出する
   * @param html ページHTML文字列
   * @returns 商品情報配列
   */
  parseLibraryPage(html: string): BoothProduct[] {
    const products = []
    const root = parseHtml(html)
    const productElements = root.querySelectorAll(
      'main > div.w-full > div.mb-16'
    )

    for (const product of productElements) {
      const productName =
        product.querySelector('a.no-underline > div')?.textContent.trim() ??
        null
      const productURL =
        product.querySelector('a.no-underline')?.getAttribute('href') ?? null
      const thumbnailURL =
        product.querySelector('a > img')?.getAttribute('src') ?? null
      const shopName =
        product.querySelector('a.no-underline + a > div')?.textContent.trim() ??
        null
      const shopURL =
        product.querySelector('a.no-underline + a')?.getAttribute('href') ??
        null

      const items = []
      const itemElements = product.querySelectorAll(
        String.raw`div.desktop\:flex.desktop\:justify-between.desktop\:items-center`
      )
      for (const item of itemElements) {
        const itemName =
          item.querySelector('div.typography-14')?.textContent.trim() ?? null
        const downloadURL =
          item.querySelector('a')?.getAttribute('href') ?? null
        // https://booth.pm/downloadables/000000 -> 00000
        const itemId = downloadURL?.match(/downloadables\/(\d+)/)?.[1] ?? null
        if (itemName && downloadURL && itemId) {
          items.push({ itemName, downloadURL, itemId })
        }
      }

      if (productName && productURL && thumbnailURL && shopName && shopURL) {
        // https://booth.pm/ja/items/5438106 -> 5438106
        const productId = /items\/(\d+)/.exec(productURL)?.[1]
        if (!productId) {
          console.warn(
            `Product ID not found for ${productName} (${productURL})`
          )
          continue
        }
        products.push({
          productId,
          productName,
          productURL,
          thumbnailURL,
          shopName,
          shopURL,
          items,
        })
      } else {
        console.warn(
          `Product data not found for ${productName} (${productURL})`
        )
      }
    }

    return products
  }

  /**
   * 商品ページのHTMLから説明文情報（html/text）配列を抽出する
   * @param html ページHTML文字列
   * @returns 説明文情報配列
   */
  parseProductPage(html: string) {
    const root = parseHtml(html)
    const descriptionElements = root.querySelectorAll(
      'section.main-info-column div.description'
    )
    const shopTextElements = root.querySelectorAll('section.shop__text')
    const mergedElements = [...descriptionElements, ...shopTextElements]
    const descriptions = []
    for (const element of mergedElements) {
      const descriptionHtml = element.innerHTML
      const descriptionText = element.textContent.trim()
      descriptions.push({
        html: descriptionHtml,
        text: descriptionText,
      })
    }
    return descriptions
  }

  /**
   * 商品説明からBooth商品IDを抽出する
   * @param description html/textを持つオブジェクト
   * @returns 抽出したBooth商品ID配列
   */
  retrieveBoothIdsFromHtml(description: { html: string; text: string }) {
    const { text } = description
    const boothIds = []
    const boothUrlMatches = text.match(
      /https:\/\/(?:[^/]+\.booth\.pm|booth\.pm)\/(?:[a-z]+\/)?items\/(\d+)/g
    )
    if (boothUrlMatches) {
      for (const boothUrl of boothUrlMatches) {
        const boothId = /items\/(\d+)/.exec(boothUrl)?.[1]
        if (boothId) {
          boothIds.push(boothId)
        }
      }
    }
    return boothIds
  }
}
