import { watch, access, constants } from 'fs'
import { join } from 'path'

type FileChangeCallback = () => void

class FileWatcher {
  private watchers: Map<string, any> = new Map()
  
  async watchPackageJson(projectPath: string, callback: FileChangeCallback): Promise<void> {
    const packageJsonPath = join(projectPath, 'package.json')
    
    // 如果已经存在监听器，先移除
    this.unwatch(packageJsonPath)
    
    // 检查文件是否存在
    try {
      await new Promise<void>((resolve, reject) => {
        access(packageJsonPath, constants.F_OK, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch (error) {
      console.warn(`package.json not found at ${packageJsonPath}, skipping watch`)
      return
    }
    
    try {
      const watcher = watch(packageJsonPath, (eventType) => {
        if (eventType === 'change') {
          callback()
        }
      })
      
      watcher.on('error', (error) => {
        console.error('Watcher error:', error)
      })
      
      this.watchers.set(packageJsonPath, watcher)
    } catch (error) {
      console.error('Failed to watch package.json:', error)
    }
  }
  
  unwatch(path: string): void {
    const watcher = this.watchers.get(path)
    if (watcher) {
      watcher.close()
      this.watchers.delete(path)
    }
  }
  
  unwatchAll(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close()
    }
    this.watchers.clear()
  }
}

export const fileWatcher = new FileWatcher()