import { describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import fs from 'node:fs'
import path from 'node:path'
import { VpmConverter } from './vpm-converter'

const TEST_REPO_DIR = 'test-vpm-repository'

describe('VpmConverter Auto Rebuild', () => {
  let vpmConverter: VpmConverter

  beforeEach(() => {
    // テスト環境をセットアップ
    process.env.VPM_REPOSITORY_DIR = TEST_REPO_DIR
    process.env.VPM_ENABLED = 'true'
    vpmConverter = new VpmConverter()

    // テストディレクトリをクリーンアップ
    if (fs.existsSync(TEST_REPO_DIR)) {
      fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true })
    }
  })

  afterEach(() => {
    // テストディレクトリをクリーンアップ
    if (fs.existsSync(TEST_REPO_DIR)) {
      fs.rmSync(TEST_REPO_DIR, { recursive: true, force: true })
    }

    // バックアップディレクトリもクリーンアップ
    const files = fs
      .readdirSync('.')
      .filter((file) => file.startsWith('test-vpm-repository.backup-'))
    for (const file of files) {
      fs.rmSync(file, { recursive: true, force: true })
    }

    delete process.env.VPM_FORCE_REBUILD
  })

  test('新規リポジトリ作成時はメタデータが生成される', async () => {
    await vpmConverter.convertBoothItemsToVpm([])

    const metadataPath = path.join(TEST_REPO_DIR, '.metadata.json')
    expect(fs.existsSync(metadataPath)).toBe(true)

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as {
      converterVersion: string
      generatedAt: string
      configHash: string
    }
    expect(metadata.converterVersion).toBe('1.0.0')
    expect(metadata.generatedAt).toBeDefined()
    expect(metadata.configHash).toBeDefined()
  })

  test('強制再構築フラグが設定されている場合は再構築される', async () => {
    // 最初のリポジトリを作成
    await vpmConverter.convertBoothItemsToVpm([])
    const metadataPath = path.join(TEST_REPO_DIR, '.metadata.json')
    const originalMetadata = JSON.parse(
      fs.readFileSync(metadataPath, 'utf8')
    ) as {
      generatedAt: string
    }

    // 強制再構築フラグを設定
    process.env.VPM_FORCE_REBUILD = 'true'

    // 少し待機してタイムスタンプを変更
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 再度実行
    await vpmConverter.convertBoothItemsToVpm([])

    // バックアップが作成されているはず
    const files = fs.readdirSync('.')
    const backupExists = files.some((file) =>
      file.startsWith(`${TEST_REPO_DIR}.backup-`)
    )
    expect(backupExists).toBe(true)

    // メタデータが更新されているはず
    const newMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as {
      generatedAt: string
    }
    expect(newMetadata.generatedAt).not.toBe(originalMetadata.generatedAt)
  })

  test('設定に変更がない場合は再構築されない', async () => {
    // 最初のリポジトリを作成
    await vpmConverter.convertBoothItemsToVpm([])
    const metadataPath = path.join(TEST_REPO_DIR, '.metadata.json')
    const originalMetadata = JSON.parse(
      fs.readFileSync(metadataPath, 'utf8')
    ) as {
      converterVersion: string
    }

    // 再度実行（設定変更なし）
    await vpmConverter.convertBoothItemsToVpm([])

    // バックアップは作成されないはず
    const files = fs.readdirSync('.')
    const backupExists = files.some((file) =>
      file.startsWith(`${TEST_REPO_DIR}.backup-`)
    )
    expect(backupExists).toBe(false)

    // メタデータのタイムスタンプが更新されているはず（チェック時に更新される）
    const newMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as {
      converterVersion: string
    }
    expect(newMetadata.converterVersion).toBe(originalMetadata.converterVersion)
  })
})
