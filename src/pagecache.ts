import fs from 'node:fs'
import { Environment } from './environment'

export class PageCache {
  private metrics: {
    hit: number
    miss: number
    expired: number
    saved: number
  } = {
    hit: 0,
    miss: 0,
    expired: 0,
    saved: 0,
  }

  save(type: string, id: string, data: any) {
    if (!data) {
      return
    }
    const path = this.getPath(type, id)
    this.makeDir(type)
    fs.writeFileSync(path, data)
    this.setSavedAt(type, id)
    this.metrics.saved++
  }

  checkItemExistence(type: string, id: string, expireDays: number | null) {
    const path = this.getPath(type, id)
    const savedAtPath = `${path}.savedAt`
    if (!fs.existsSync(path) || !fs.existsSync(savedAtPath)) {
      return 0
    }

    if (expireDays) {
      const savedAt = new Date(fs.readFileSync(savedAtPath, 'utf8'))
      const now = new Date()
      const diffDays = Math.floor(
        (now.getTime() - savedAt.getTime()) / (1000 * 3600 * 24)
      )
      if (diffDays > expireDays) {
        return -1
      }
    }

    return 1
  }

  load(type: string, id: string, expireDays: number | null) {
    const existResult = this.checkItemExistence(type, id, expireDays)
    if (existResult === 0) {
      this.metrics.miss++
      return null
    }
    const path = this.getPath(type, id)
    if (existResult === -1) {
      this.metrics.expired++
      fs.unlinkSync(path)
      fs.unlinkSync(`${path}.savedAt`)
      return null
    }
    this.metrics.hit++
    return fs.readFileSync(path)
  }

  async loadOrFetch<T>(
    type: string,
    id: string,
    expireDays: number | null,
    fetchFunc: () => Promise<T>
  ): Promise<T> {
    const data = this.load(type, id, expireDays) as T | null
    if (data) {
      return data
    }
    const newData = await fetchFunc()
    this.save(type, id, newData)
    return newData
  }

  list(type: string) {
    const path = this.getPath(type, '')
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (!fs.existsSync(dir)) {
      return []
    }
    const files = fs.readdirSync(dir, { withFileTypes: true })
    return files
      .filter((file) => file.isFile() && file.name.endsWith('.html'))
      .map((file) => file.name.replace('.html', ''))
  }

  getMetrics() {
    return this.metrics
  }

  private setSavedAt(type: string, id: string) {
    const path = this.getPath(type, id)
    const savedAtPath = `${path}.savedAt`
    const savedAt = new Date()
    fs.writeFileSync(savedAtPath, savedAt.toISOString(), 'utf8')
  }

  private getPath(type: string, id: string) {
    return Environment.getPath('CACHE_DIR', `${type}/${id}.html`)
  }

  private makeDir(type: string) {
    const path = this.getPath(type, '')
    const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
    if (fs.existsSync(dir)) {
      return
    }
    fs.mkdirSync(dir, { recursive: true })
  }
}
