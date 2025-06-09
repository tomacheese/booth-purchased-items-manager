import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { Environment } from './environment'
import { Logger } from '@book000/node-utils'
import type { BoothProduct, BoothProductItem } from './booth'

export interface VpmPackageManifest {
  name: string
  displayName: string
  version: string
  description: string
  author?: {
    name: string
    email?: string
  }
  unity: string
  url: string
  vpmDependencies?: Record<string, string>
  legacyFolders?: Record<string, string>
  legacyFiles?: Record<string, string>
  legacyPackages?: string[]
}

export interface VpmRepositoryManifest {
  name: string
  id: string
  url: string
  author?: {
    name: string
    email?: string
  }
  packages: Record<
    string,
    {
      versions: Record<string, VpmPackageManifest>
    }
  >
}

export class VpmConverter {
  private logger = Logger.configure('VpmConverter')
  private repositoryDir: string

  constructor() {
    this.repositoryDir = Environment.getPath('VPM_REPOSITORY_DIR')
  }

  /**
   * Boothで購入したUnityPackageをVPM形式に変換する
   */
  convertBoothItemsToVpm(products: BoothProduct[]): void {
    if (!Environment.getBoolean('VPM_ENABLED')) {
      this.logger.info('VPM conversion is disabled')
      return
    }

    this.logger.info('Starting VPM conversion for Booth items')

    const vpmRepository = this.loadOrCreateRepository()
    let hasUpdates = false

    for (const product of products) {
      const unityPackageItems = product.items.filter((item) => {
        const lowerItemName = item.itemName.toLowerCase()
        return (
          lowerItemName.includes('.unitypackage') ||
          lowerItemName.endsWith('.zip')
        )
      })

      if (unityPackageItems.length === 0) {
        continue
      }

      this.logger.info(
        `Processing product: ${product.productName} [${product.productId}]`
      )

      for (const item of unityPackageItems) {
        try {
          const packagePath = this.getItemPath(
            product.productId,
            item.itemId,
            item.itemName
          )

          this.logger.info(
            `Checking UnityPackage: ${item.itemName} -> ${packagePath}`
          )

          if (!fs.existsSync(packagePath)) {
            this.logger.warn(`UnityPackage not found: ${packagePath}`)
            continue
          }

          // ZIP圧縮されたUnityPackageの場合は展開し、全UnityPackageを取得
          const actualPackagePaths =
            this.extractAllUnityPackagesFromZip(packagePath)

          // 各UnityPackageを個別に処理
          for (const actualPackagePath of actualPackagePaths) {
            const vpmPackage = this.convertUnityPackageToVpm(
              actualPackagePath,
              product,
              item,
              vpmRepository
            )

            if (vpmPackage) {
              this.addPackageToRepository(vpmRepository, vpmPackage)
              // パッケージが追加されるたびに逐次保存
              this.saveRepository(vpmRepository)
              hasUpdates = true
              this.logger.info(
                `Converted to VPM: ${vpmPackage.name}@${vpmPackage.version}`
              )
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to convert ${item.itemName}:`,
            error instanceof Error ? error : new Error(String(error))
          )
        }
      }
    }

    if (hasUpdates) {
      this.logger.info('VPM repository conversion completed')
    }
  }

  /**
   * UnityPackageファイルをVPM形式に変換する
   */
  private convertUnityPackageToVpm(
    packagePath: string,
    product: BoothProduct,
    item: BoothProductItem,
    existingRepository: VpmRepositoryManifest
  ): VpmPackageManifest | null {
    try {
      // ファイル識別子を抽出
      const fileIdentifier = this.extractFileIdentifier(item.itemName)

      // UnityPackageの基本情報を取得（ファイル識別子付き）
      const packageName = this.generatePackageName(product, fileIdentifier)

      // ファイルハッシュを計算して同じファイルかチェック
      const fileHash = this.calculateFileHash(packagePath)
      if (
        this.isFileAlreadyProcessed(packageName, fileHash, existingRepository)
      ) {
        this.logger.debug(
          `File already processed for ${packageName}: ${fileHash}`
        )
        return null
      }

      const version = this.generateVersion(
        packagePath,
        packageName,
        existingRepository,
        item.itemName // 元のアイテム名も渡す
      )

      // 既存バージョンをチェック
      if (this.isVersionExists(packageName, version)) {
        this.logger.debug(
          `Version ${version} already exists for ${packageName}`
        )
        return null
      }

      // VPMパッケージディレクトリを作成
      const vpmPackageDir = path.join(
        this.repositoryDir,
        'packages',
        packageName,
        version
      )

      if (!fs.existsSync(vpmPackageDir)) {
        fs.mkdirSync(vpmPackageDir, { recursive: true })
      }

      // UnityPackageをVPM形式に変換
      const zipPath = path.join(vpmPackageDir, `${packageName}-${version}.zip`)

      // package.jsonを生成
      const manifest: VpmPackageManifest = {
        name: packageName,
        displayName: this.sanitizeDisplayName(product.productName),
        version,
        description: `${product.productName} - ${item.itemName} (from Booth) [Hash: ${fileHash}]`,
        author: {
          name: product.shopName,
        },
        unity: '2022.3',
        url: this.generatePackageUrl(packageName, version),
        legacyFolders: this.generateLegacyFolders(packageName),
      }

      this.createVpmPackageFromUnityPackage(packagePath, zipPath, manifest)

      const manifestPath = path.join(vpmPackageDir, 'package.json')
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

      return manifest
    } catch (error) {
      this.logger.error(
        `Error converting UnityPackage to VPM:`,
        error instanceof Error ? error : new Error(String(error))
      )
      return null
    }
  }

  /**
   * VPMパッケージ名を生成する
   */
  private generatePackageName(
    product: BoothProduct,
    fileIdentifier?: string
  ): string {
    // Extract shop name from URL like https://xxx.booth.pm/
    const shopNameMatch = /https:\/\/([^.]+)\.booth\.pm/.exec(product.shopURL)
    const shopName = shopNameMatch ? shopNameMatch[1] : 'unknown'
    const basePackageName = `com.booth.${shopName}.${product.productId}`

    if (fileIdentifier) {
      return `${basePackageName}.${fileIdentifier}`
    }
    return basePackageName
  }

  /**
   * ファイル名からユニークな識別子を抽出する
   */
  private extractFileIdentifier(filename: string): string {
    const nameWithoutExt = path.basename(filename, path.extname(filename))

    // まずバージョンパターンを除去
    const versionPatterns = [
      /_?v\d+\.\d+\.\d+$/i, // _v1.0.0, v1.0.0
      /_?ver\.?\d+\.\d+\.\d+$/i, // _ver1.0.0, _ver.1.0.0
      /_?Ver\d+\.\d+$/i, // _Ver1.1
      /V\d+\.\d+$/i, // V1.2
    ]

    let cleanName = nameWithoutExt
    for (const pattern of versionPatterns) {
      cleanName = cleanName.replace(pattern, '')
    }

    // 一般的なファイル名パターンのクリーンアップ
    // 大文字で始まる単語を連続させたパターン（CamelCase商品名など）を処理
    // ただし、具体的な商品名はハードコーディングしない

    // 前後のアンダースコアやドットを除去
    cleanName = cleanName.replaceAll(/^[._-]+|[._-]+$/g, '')

    // 意味のない部分を除去
    const meaninglessParts = [
      'Materials',
      'Material',
      'Texture',
      'Tex',
      'Full',
      'FullSet',
      'Set',
      'Komado',
      'FullSet',
    ]
    for (const part of meaninglessParts) {
      cleanName = cleanName.replaceAll(new RegExp(part, 'gi'), '')
    }

    // 再度前後のアンダースコアやドットを除去
    cleanName = cleanName.replaceAll(/^[._-]+|[._-]+$/g, '')

    // 空の場合やファイル全体が商品名のみの場合
    if (!cleanName || cleanName.length === 0) {
      // 特殊なケースの識別
      if (nameWithoutExt.toLowerCase().includes('material')) {
        return 'materials'
      }
      if (nameWithoutExt.toLowerCase().includes('texture')) {
        return 'textures'
      }
      // 単一ファイルの場合は識別子なしとする
      return ''
    }

    // アンダースコアとドットで分割
    const parts = cleanName.split(/[._-]+/).filter((part) => part.length > 0)

    if (parts.length === 0) {
      return ''
    }

    // 複数のアバター名が含まれている場合の処理
    if (parts.length > 1) {
      // 全てが大文字始まりの名前かチェック
      if (parts.every((part) => /^[A-Z][a-z]+$/.test(part))) {
        const combined = parts.join('').toLowerCase()
        return combined.slice(0, 20)
      }
      // そうでなければ最初の意味のある部分を使用
      return parts[0]
        .toLowerCase()
        .replaceAll(/[^a-z0-9]/g, '')
        .slice(0, 20)
    }

    // 単一の部分の場合
    const identifier = parts[0].toLowerCase().replaceAll(/[^a-z0-9]/g, '')
    return identifier.slice(0, 20) || ''
  }

  /**
   * セマンティックバージョンを生成する
   */
  private generateVersion(
    packagePath: string,
    packageName: string,
    existingRepository: VpmRepositoryManifest,
    originalItemName?: string
  ): string {
    // まず元のアイテム名からバージョンを抽出を試行
    let extractedVersion: string | null = null
    if (originalItemName) {
      extractedVersion = this.extractVersionFromFilename(originalItemName)
    }

    // 元のアイテム名からバージョンが抽出できない場合は、パッケージパスから抽出
    extractedVersion ??= this.extractVersionFromFilename(packagePath)

    if (extractedVersion) {
      // 抽出したバージョンが既存のものと重複しないかチェック
      const existingPackage = existingRepository.packages[packageName]
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!existingPackage?.versions[extractedVersion]) {
        return extractedVersion
      }
    }

    // ファイル名からバージョンが特定できない場合は日付ベースのバージョンを使用
    const stats = fs.statSync(packagePath)
    const dateVersion = this.generateDateBasedVersion(stats.mtime)

    // 日付ベースのバージョンが重複しないかチェック
    const existingPackageForDate = existingRepository.packages[packageName]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!existingPackageForDate?.versions[dateVersion]) {
      return dateVersion
    }

    // 日付ベースのバージョンが重複する場合、プレリリース識別子を追加
    // 例: 2025.6.8 → 2025.6.8-1 → 2025.6.8-2 ...
    let counter = 1
    let versionWithSuffix = `${dateVersion}-${counter}`

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (existingPackageForDate.versions[versionWithSuffix]) {
      counter++
      versionWithSuffix = `${dateVersion}-${counter}`
    }
    return versionWithSuffix
  }

  /**
   * ファイル名からバージョンを抽出する
   */
  private extractVersionFromFilename(filePath: string): string | null {
    const filename = path.basename(filePath, '.unitypackage')

    // 一般的なバージョンパターンを試行
    const patterns = [
      /[_-]v(\d+(?:\.\d+)*)/i, // _v2.8.5, -v1.0, -v1
      /[_-]ver\.?(\d+(?:\.\d+)*)/i, // _ver1.0.0, _ver.1.0.0, _Ver1.4, _Ver1
      /[_-]V(\d+(?:\.\d+)*)/, // _V1.0, _V1
      /V(\d+(?:\.\d+)*)/i, // V1.2, V2.0 (区切り文字なし)
      /[_-]version[_-]?(\d+(?:\.\d+)*)/i, // _version1.0, _version_1.0, _version1
      /[_-](\d+(?:\.\d+)+)/i, // _1.03, _2.8.5 (アンダースコア + バージョン)
      /(\d+(?:\.\d+)*)\.unitypackage$/i, // filename1.0.1.unitypackage, filename1.unitypackage
      /[_-](\d+[_-]\d+[_-]\d+)(?:[_-]|$)/, // _1_6_1 形式
    ]

    for (const pattern of patterns) {
      const match = filename.match(pattern)
      if (match) {
        let version = match[1]
        // アンダースコア区切りをドット区切りに変換
        version = version.replaceAll('_', '.')

        // セマンティックバージョンの形式に正規化
        const parts = version.split('.').map((part) => {
          // 先頭ゼロを削除（例: "03" → "3"）
          return Number.parseInt(part, 10).toString()
        })

        // 最低2つのパート（major.minor）が必要
        if (parts.length < 2) {
          parts.push('0')
        }
        // 3つ目のパート（patch）は必要に応じて追加
        if (parts.length < 3) {
          parts.push('0')
        }

        return parts.slice(0, 3).join('.')
      }
    }

    return null
  }

  /**
   * 日付ベースのバージョンを生成する
   */
  private generateDateBasedVersion(date: Date): string {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${year}.${month}.${day}`
  }

  /**
   * 表示名をサニタイズする
   */
  private sanitizeDisplayName(name: string): string {
    return name.replaceAll(/[<>:"/\\|?*]/g, '').trim()
  }

  /**
   * UnityPackageからVPMパッケージを作成する
   */
  private createVpmPackageFromUnityPackage(
    sourcePath: string,
    targetZipPath: string,
    manifest: VpmPackageManifest
  ): void {
    const tempDir = path.join(path.dirname(sourcePath), 'temp_vpm_package')

    try {
      // 一時ディレクトリを作成
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
      fs.mkdirSync(tempDir, { recursive: true })

      if (sourcePath.toLowerCase().endsWith('.unitypackage')) {
        // UnityPackageを展開してVPM構造に変換
        this.extractAndConvertUnityPackage(sourcePath, tempDir, manifest)
      } else {
        // ZIP内のUnityPackageを処理
        this.extractAndConvertFromZip(sourcePath, tempDir, manifest)
      }

      // VPMパッケージのZIPを作成
      execSync(`cd "${tempDir}" && zip -r -q "${targetZipPath}" .`, {
        stdio: 'inherit',
      })

      this.logger.info(`Created VPM package: ${path.basename(targetZipPath)}`)
    } catch (error) {
      this.logger.error(
        `Failed to create VPM package: ${String(error)}`,
        error instanceof Error ? error : new Error(String(error))
      )
      // エラーの場合は簡単な構造でフォールバック
      this.createFallbackPackage(sourcePath, targetZipPath, manifest)
    } finally {
      // 一時ディレクトリを削除
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * UnityPackageを展開してVPM構造に変換
   */
  private extractAndConvertUnityPackage(
    unityPackagePath: string,
    targetDir: string,
    manifest: VpmPackageManifest
  ): void {
    const extractDir = path.join(targetDir, 'extracted')

    try {
      fs.mkdirSync(extractDir, { recursive: true })

      // UnityPackageを展開（tarファイルとして）
      execSync(`tar -xf "${unityPackagePath}" -C "${extractDir}"`, {
        stdio: 'inherit',
      })

      // VPM構造を作成
      this.createVpmStructure(extractDir, targetDir, manifest)
    } finally {
      // UnityPackage展開用の一時フォルダを削除
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * ZIP内のUnityPackageを処理
   */
  private extractAndConvertFromZip(
    zipPath: string,
    targetDir: string,
    manifest: VpmPackageManifest
  ): void {
    const extractDir = path.join(targetDir, 'zip_extracted')

    try {
      fs.mkdirSync(extractDir, { recursive: true })

      // ZIPを展開
      execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`, {
        stdio: 'inherit',
      })

      // UnityPackageファイルを検索
      const unityPackageFiles = this.findUnityPackageFiles(extractDir)

      if (unityPackageFiles.length > 0) {
        // 最初のUnityPackageを使用
        this.extractAndConvertUnityPackage(
          unityPackageFiles[0],
          targetDir,
          manifest
        )
      } else {
        // UnityPackageが見つからない場合は警告
        this.logger.warn(`No UnityPackage found in ${zipPath}`)
        this.createFallbackPackage(
          zipPath,
          path.join(targetDir, 'fallback.zip'),
          manifest
        )
      }
    } finally {
      // ZIP展開用の一時フォルダを削除
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * VPMパッケージ構造を作成
   */
  private createVpmStructure(
    extractedDir: string,
    targetDir: string,
    manifest: VpmPackageManifest
  ): void {
    // package.jsonを作成
    const packageJsonPath = path.join(targetDir, 'package.json')
    fs.writeFileSync(packageJsonPath, JSON.stringify(manifest, null, 2))

    // Runtime フォルダを作成
    const runtimeDir = path.join(targetDir, 'Runtime')
    fs.mkdirSync(runtimeDir, { recursive: true })

    // Editor フォルダを作成
    const editorDir = path.join(targetDir, 'Editor')
    fs.mkdirSync(editorDir, { recursive: true })

    // UnityPackageの内容を適切なフォルダに配置
    this.organizeUnityPackageAssets(extractedDir, runtimeDir, editorDir)

    // Runtime.asmdefを作成
    this.createRuntimeAsmdef(runtimeDir, manifest.name)

    // Editor.asmdefを作成
    this.createEditorAsmdef(editorDir, manifest.name)

    this.logger.info('Created VPM package structure')
  }

  /**
   * UnityPackageのアセットを適切なフォルダに整理
   */
  private organizeUnityPackageAssets(
    extractedDir: string,
    runtimeDir: string,
    editorDir: string
  ): void {
    try {
      // UnityPackageの構造を解析
      const pathsToProcess = this.parseUnityPackageStructure(extractedDir)

      for (const { assetPath, filePath } of pathsToProcess) {
        // アセットパスに基づいてRuntime/Editorを決定
        const isEditorAsset = this.isEditorAsset(assetPath)
        const targetDir = isEditorAsset ? editorDir : runtimeDir

        // ファイルの配置先を決定
        const relativePath = this.getRelativeAssetPath(assetPath)
        const targetPath = path.join(targetDir, relativePath)

        // ディレクトリを作成
        const targetDirPath = path.dirname(targetPath)
        fs.mkdirSync(targetDirPath, { recursive: true })

        // ファイルをコピー
        if (fs.existsSync(filePath)) {
          fs.copyFileSync(filePath, targetPath)
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to organize UnityPackage assets: ${String(error)}`
      )
      // フォールバック: すべてのファイルをRuntimeに配置
      this.copyAllAssetsToRuntime(extractedDir, runtimeDir)
    }
  }

  /**
   * UnityPackageの構造を解析
   */
  private parseUnityPackageStructure(extractedDir: string): {
    assetPath: string
    filePath: string
  }[] {
    const assetPaths: { assetPath: string; filePath: string }[] = []

    try {
      const entries = fs.readdirSync(extractedDir)

      for (const entry of entries) {
        const entryPath = path.join(extractedDir, entry)
        const stat = fs.statSync(entryPath)

        if (stat.isDirectory()) {
          // UnityPackageの各アセットディレクトリを処理
          const pathnamePath = path.join(entryPath, 'pathname')
          const assetPath = path.join(entryPath, 'asset')

          if (fs.existsSync(pathnamePath) && fs.existsSync(assetPath)) {
            const pathname = fs.readFileSync(pathnamePath, 'utf8').trim()
            assetPaths.push({
              assetPath: pathname,
              filePath: assetPath,
            })
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse UnityPackage structure: ${String(error)}`
      )
    }

    return assetPaths
  }

  /**
   * エディタ専用アセットかどうかを判定
   */
  private isEditorAsset(assetPath: string): boolean {
    const normalizedPath = assetPath.toLowerCase()
    return (
      normalizedPath.includes('/editor/') ||
      normalizedPath.includes('\\editor\\') ||
      normalizedPath.endsWith('editor.cs') ||
      normalizedPath.includes('editorwindow') ||
      normalizedPath.includes('inspector')
    )
  }

  /**
   * アセットの相対パスを取得
   */
  private getRelativeAssetPath(assetPath: string): string {
    // Assets/ プレフィックスを除去
    let relativePath = assetPath
    if (relativePath.startsWith('Assets/')) {
      relativePath = relativePath.slice(7)
    } else if (relativePath.startsWith('Assets\\')) {
      relativePath = relativePath.slice(7)
    }

    return relativePath
  }

  /**
   * すべてのアセットをRuntimeにコピー（フォールバック）
   */
  private copyAllAssetsToRuntime(sourceDir: string, runtimeDir: string): void {
    try {
      execSync(`cp -r "${sourceDir}"/* "${runtimeDir}"/`, {
        stdio: 'inherit',
      })
    } catch (error) {
      this.logger.warn(`Failed to copy assets to Runtime: ${String(error)}`)
    }
  }

  /**
   * Runtime.asmdefを作成
   */
  private createRuntimeAsmdef(runtimeDir: string, packageName: string): void {
    const asmdefContent = {
      name: `${packageName}.Runtime`,
      rootNamespace: packageName.replaceAll(/[^a-zA-Z0-9]/g, ''),
      references: [],
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    }

    const asmdefPath = path.join(runtimeDir, `${packageName}.Runtime.asmdef`)
    fs.writeFileSync(asmdefPath, JSON.stringify(asmdefContent, null, 2))
  }

  /**
   * Editor.asmdefを作成
   */
  private createEditorAsmdef(editorDir: string, packageName: string): void {
    const asmdefContent = {
      name: `${packageName}.Editor`,
      rootNamespace: packageName.replaceAll(/[^a-zA-Z0-9]/g, ''),
      references: [`${packageName}.Runtime`],
      includePlatforms: ['Editor'],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    }

    const asmdefPath = path.join(editorDir, `${packageName}.Editor.asmdef`)
    fs.writeFileSync(asmdefPath, JSON.stringify(asmdefContent, null, 2))
  }

  /**
   * フォールバック用の簡単なパッケージを作成
   */
  private createFallbackPackage(
    sourcePath: string,
    targetZipPath: string,
    manifest: VpmPackageManifest
  ): void {
    const tempDir = path.join(path.dirname(sourcePath), 'temp_fallback')

    try {
      fs.mkdirSync(tempDir, { recursive: true })

      // package.jsonを作成
      const packageJsonPath = path.join(tempDir, 'package.json')
      fs.writeFileSync(packageJsonPath, JSON.stringify(manifest, null, 2))

      // 元ファイルをコピー
      const fileName = path.basename(sourcePath)
      fs.copyFileSync(sourcePath, path.join(tempDir, fileName))

      // ZIPを作成
      execSync(`cd "${tempDir}" && zip -r -q "${targetZipPath}" .`, {
        stdio: 'inherit',
      })

      this.logger.info('Created fallback package')
    } catch (error) {
      this.logger.error(`Failed to create fallback package: ${String(error)}`)
      // 最終フォールバック
      fs.copyFileSync(sourcePath, targetZipPath)
    } finally {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  }

  /**
   * ディレクトリ内のUnityPackageファイルを再帰的に検索
   */
  private findUnityPackageFiles(directory: string): string[] {
    const unityPackageFiles: string[] = []

    const searchRecursively = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          searchRecursively(fullPath)
        } else if (entry.name.toLowerCase().endsWith('.unitypackage')) {
          unityPackageFiles.push(fullPath)
        }
      }
    }

    searchRecursively(directory)
    return unityPackageFiles
  }

  /**
   * VPMパッケージのURLを生成する
   */
  private generatePackageUrl(packageName: string, version: string): string {
    const baseUrl = Environment.getValue('VPM_BASE_URL')
    const packageFileName = `${packageName}-${version}.zip`

    if (baseUrl) {
      // HTTPサーバーでホストする場合
      const cleanBaseUrl = baseUrl.replace(/\/$/, '') // 末尾のスラッシュを除去
      return `${cleanBaseUrl}/packages/${packageName}/${version}/${packageFileName}`
    } else {
      // ローカルファイルの場合（従来通り）
      const zipPath = path.join(
        this.repositoryDir,
        'packages',
        packageName,
        version,
        packageFileName
      )
      return `file://${zipPath}`
    }
  }

  /**
   * VPMリポジトリのURLを生成する
   */
  private generateRepositoryUrl(): string {
    const baseUrl = Environment.getValue('VPM_BASE_URL')

    if (baseUrl) {
      // HTTPサーバーでホストする場合
      const cleanBaseUrl = baseUrl.replace(/\/$/, '') // 末尾のスラッシュを除去
      return `${cleanBaseUrl}/vpm.json`
    } else {
      // ローカルファイルの場合（従来通り）
      const manifestPath = path.join(this.repositoryDir, 'vpm.json')
      return `file://${manifestPath}`
    }
  }

  /**
   * レガシーフォルダ設定を生成する
   */
  private generateLegacyFolders(packageName: string): Record<string, string> {
    // パッケージ名からGUIDを生成
    const hash = crypto.createHash('md5').update(packageName).digest('hex')
    return {
      [`Assets\\${packageName}`]: hash,
    }
  }

  /**
   * ファイルのハッシュを計算する
   */
  private calculateFileHash(filePath: string): string {
    const fileContent = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(fileContent).digest('hex')
  }

  /**
   * 同じファイルが既に処理されているかチェック
   */
  private isFileAlreadyProcessed(
    packageName: string,
    fileHash: string,
    repository: VpmRepositoryManifest
  ): boolean {
    const existingPackage = repository.packages[packageName]
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!existingPackage) {
      return false
    }

    // 既存のバージョンのメタデータにハッシュが含まれているかチェック
    for (const version of Object.values(existingPackage.versions)) {
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (version.description && version.description.includes(fileHash)) {
        return true
      }
    }

    return false
  }

  /**
   * バージョンが既に存在するかチェック
   */
  private isVersionExists(packageName: string, version: string): boolean {
    const versionDir = path.join(
      this.repositoryDir,
      'packages',
      packageName,
      version
    )
    return fs.existsSync(versionDir)
  }

  /**
   * ZIP圧縮されたUnityPackageを展開し、全UnityPackageファイルのパスを返す
   */
  private extractAllUnityPackagesFromZip(packagePath: string): string[] {
    // ZIPファイルの場合（.unitypackage.zip や通常の.zip）
    if (packagePath.toLowerCase().endsWith('.zip')) {
      const extractDir = path.join(
        path.dirname(packagePath),
        'extracted_' + path.basename(packagePath, '.zip')
      )

      // 既に展開済みの場合はスキップ
      if (fs.existsSync(extractDir)) {
        const unityPackageFiles = fs
          .readdirSync(extractDir)
          .filter((file) => file.toLowerCase().endsWith('.unitypackage'))

        if (unityPackageFiles.length > 0) {
          return unityPackageFiles.map((file) => path.join(extractDir, file))
        }
      }

      this.logger.info(`Extracting ZIP file: ${packagePath}`)

      try {
        // ディレクトリを作成
        if (!fs.existsSync(extractDir)) {
          fs.mkdirSync(extractDir, { recursive: true })
        }

        // unzipコマンドを使用してZIPファイルを展開
        execSync(`unzip -q -o "${packagePath}" -d "${extractDir}"`, {
          stdio: 'inherit',
        })

        // 展開されたUnityPackageファイルを探す
        const files = fs.readdirSync(extractDir)
        this.logger.debug(`Files in extracted ZIP: ${files.join(', ')}`)

        // 再帰的に検索
        const unityPackageFiles = this.findUnityPackageFiles(extractDir)
        this.logger.debug(
          `Found UnityPackage files: ${unityPackageFiles.join(', ')}`
        )

        if (unityPackageFiles.length === 0) {
          this.logger.warn(`No .unitypackage file found in extracted ZIP`)
          this.logger.debug(`Checked directory: ${extractDir}`)
          return [packagePath]
        }

        const unityPackagePaths = unityPackageFiles
        this.logger.info(
          `Found ${unityPackageFiles.length} UnityPackage(s): ${unityPackageFiles.join(', ')}`
        )
        return unityPackagePaths
      } catch (error) {
        this.logger.error(
          `Failed to extract ZIP file: ${packagePath}`,
          error instanceof Error ? error : new Error(String(error))
        )
        return [packagePath]
      }
    }

    // ZIP圧縮されていない場合は元のパスをそのまま返す
    return [packagePath]
  }

  /**
   * アイテムのファイルパスを取得
   */
  private getItemPath(
    productId: string,
    itemId: string,
    itemName: string
  ): string {
    const fileExtension = itemName.split('.').pop()
    return Environment.getPath(
      'DOWNLOADED_ITEMS_DIR',
      `${productId}/${itemId}.${fileExtension}`
    )
  }

  /**
   * VPMリポジトリマニフェストを読み込み、なければ作成
   */
  private loadOrCreateRepository(): VpmRepositoryManifest {
    const manifestPath = path.join(this.repositoryDir, 'vpm.json')

    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8')
      return JSON.parse(content) as VpmRepositoryManifest
    }

    // 新しいリポジトリを作成
    const repository: VpmRepositoryManifest = {
      name: 'Booth Purchased Items VPM Repository',
      id: 'com.booth.purchased.vpm',
      url: this.generateRepositoryUrl(),
      author: {
        name: 'Booth Purchased Items Manager',
      },
      packages: {},
    }

    return repository
  }

  /**
   * リポジトリにパッケージを追加
   */
  private addPackageToRepository(
    repository: VpmRepositoryManifest,
    packageManifest: VpmPackageManifest
  ): void {
    const { name, version } = packageManifest

    repository.packages[name] ??= { versions: {} }

    repository.packages[name].versions[version] = packageManifest
  }

  /**
   * リポジトリマニフェストを保存
   */
  private saveRepository(repository: VpmRepositoryManifest): void {
    const manifestPath = path.join(this.repositoryDir, 'vpm.json')
    fs.writeFileSync(manifestPath, JSON.stringify(repository, null, 2))

    const totalPackages = Object.keys(repository.packages).length
    const totalVersions = Object.values(repository.packages).reduce(
      (sum, pkg) => sum + Object.keys(pkg.versions).length,
      0
    )
    this.logger.debug(
      `Updated VPM repository: ${totalPackages} packages, ${totalVersions} versions`
    )
  }

  /**
   * リポジトリの統計情報を取得
   */
  getRepositoryStats(): {
    totalPackages: number
    totalVersions: number
    packages: { name: string; versions: string[] }[]
  } {
    const repository = this.loadOrCreateRepository()
    const packages = Object.entries(repository.packages).map(([name, pkg]) => ({
      name,
      versions: Object.keys(pkg.versions),
    }))

    return {
      totalPackages: packages.length,
      totalVersions: packages.reduce(
        (sum, pkg) => sum + pkg.versions.length,
        0
      ),
      packages,
    }
  }
}
