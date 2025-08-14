import { BoothProduct } from './booth'
import fs from 'node:fs'
import { Environment } from './environment'

interface LinkedItem {
  productId: string
  name: string
  shop: string
}

interface LinkedListResult {
  product: LinkedItem
  outgoingLinks: LinkedItem[]
  incomingLinks: LinkedItem[]
}

/**
 * HTMLテンプレートを生成する
 */
function generateHtmlTemplate(results: LinkedListResult[]): string {
  const totalProducts = results.length
  const totalOutgoingLinks = results.reduce(
    (sum, result) => sum + result.outgoingLinks.length,
    0
  )
  const totalIncomingLinks = results.reduce(
    (sum, result) => sum + result.incomingLinks.length,
    0
  )

  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>リンクアイテム一覧</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            text-align: center;
        }
        
        .header h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        
        .header p {
            color: #7f8c8d;
            font-size: 1.1em;
        }
        
        .stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 20px;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #3498db;
        }
        
        .stat-label {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        .search-box {
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }
        
        .search-input {
            width: 100%;
            padding: 12px 20px;
            border: 2px solid #e0e0e0;
            border-radius: 25px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s;
        }
        
        .search-input:focus {
            border-color: #3498db;
        }
        
        .product-list {
            display: grid;
            gap: 20px;
        }
        
        .product-card {
            background: #fff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 25px;
        }
        
        .product-header {
            border-bottom: 2px solid #f1f2f6;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .product-title {
            color: #2c3e50;
            margin-bottom: 5px;
            font-size: 1.4em;
        }
        
        .product-id {
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            color: #666;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 4px;
            display: inline-block;
        }
        
        .links-section {
            margin-bottom: 20px;
        }
        
        .links-section:last-child {
            margin-bottom: 0;
        }
        
        .links-title {
            color: #3498db;
            font-size: 1.1em;
            margin-bottom: 10px;
            font-weight: bold;
        }
        
        .links-list {
            list-style: none;
        }
        
        .links-list li {
            margin-bottom: 8px;
        }
        
        .link-item {
            color: #e74c3c;
            text-decoration: none;
            font-weight: 500;
            transition: color 0.3s;
        }
        
        .link-item:hover {
            color: #c0392b;
            text-decoration: underline;
        }
        
        .shop-name {
            color: #7f8c8d;
            font-size: 0.9em;
            margin-left: 8px;
        }
        
        .no-results {
            text-align: center;
            color: #7f8c8d;
            font-size: 1.1em;
            margin-top: 50px;
            display: none;
        }
        
        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }
            
            .stats {
                flex-direction: column;
                gap: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>リンクアイテム一覧</h1>
            <p>BOOTH購入アイテム間のリンク関係を表示しています</p>
            <div class="stats">
                <div class="stat">
                    <div class="stat-number">${totalProducts}</div>
                    <div class="stat-label">商品</div>
                </div>
                <div class="stat">
                    <div class="stat-number">${totalOutgoingLinks}</div>
                    <div class="stat-label">リンク先</div>
                </div>
                <div class="stat">
                    <div class="stat-number">${totalIncomingLinks}</div>
                    <div class="stat-label">被リンク</div>
                </div>
            </div>
        </div>
        
        <div class="search-box">
            <input type="text" class="search-input" placeholder="商品名で検索..." id="searchInput">
        </div>
        
        <div class="product-list" id="productList">
            ${results
              .map(
                (result) => `
            <div class="product-card" data-product-name="${result.product.name.toLowerCase()}">
                <div class="product-header">
                    <div class="product-title">${result.product.name}</div>
                    <div class="product-id">${result.product.productId}</div>
                </div>
                
                ${
                  result.outgoingLinks.length > 0
                    ? `
                <div class="links-section">
                    <div class="links-title">リンク先</div>
                    <ul class="links-list">
                        ${result.outgoingLinks
                          .map(
                            (item) =>
                              `<li><a href="https://booth.pm/ja/items/${item.productId}" class="link-item" target="_blank">${item.name}</a><span class="shop-name">(${item.shop})</span></li>`
                          )
                          .join('')}
                    </ul>
                </div>
                `
                    : ''
                }
                
                ${
                  result.incomingLinks.length > 0
                    ? `
                <div class="links-section">
                    <div class="links-title">被リンク</div>
                    <ul class="links-list">
                        ${result.incomingLinks
                          .map(
                            (item) =>
                              `<li><a href="https://booth.pm/ja/items/${item.productId}" class="link-item" target="_blank">${item.name}</a><span class="shop-name">(${item.shop})</span></li>`
                          )
                          .join('')}
                    </ul>
                </div>
                `
                    : ''
                }
            </div>
            `
              )
              .join('')}
        </div>
        
        <div class="no-results" id="noResults">
            検索条件に一致する商品が見つかりませんでした。
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const searchInput = document.getElementById('searchInput');
            const productList = document.getElementById('productList');
            const noResults = document.getElementById('noResults');
            const productCards = document.querySelectorAll('.product-card');

            searchInput.addEventListener('input', function() {
                const searchTerm = this.value.toLowerCase().trim();
                let visibleCount = 0;

                productCards.forEach(function(card) {
                    const productName = card.getAttribute('data-product-name');
                    if (productName.includes(searchTerm)) {
                        card.style.display = 'block';
                        visibleCount++;
                    } else {
                        card.style.display = 'none';
                    }
                });

                if (visibleCount === 0) {
                    noResults.style.display = 'block';
                } else {
                    noResults.style.display = 'none';
                }
            });
        });
    </script>
</body>
</html>`
}

export function generateLinkedList() {
  const productPath = Environment.getPath('PRODUCTS_PATH')
  const idLinkingPath = Environment.getPath('ID_MAPPING_PATH')
  const linkedItemsPath = Environment.getPath('LINKED_ITEMS_PATH')
  const linkedItemsHtmlPath = Environment.getPath('LINKED_ITEMS_HTML_PATH')
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

  // Filter results that have links (same logic for both outputs)
  const filteredResults = results.filter(
    (result) =>
      result.outgoingLinks.length > 0 || result.incomingLinks.length > 0
  )

  // Generate Markdown
  const markdown = filteredResults
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

  // Generate HTML
  const html = generateHtmlTemplate(filteredResults)

  // Write files
  fs.writeFileSync(linkedItemsPath, markdown)
  fs.writeFileSync(linkedItemsHtmlPath, html)
}
