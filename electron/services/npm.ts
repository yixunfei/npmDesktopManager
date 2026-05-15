import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import https from 'https'
import { BrowserWindow } from 'electron'

const execFileAsync = promisify(execFile)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let mainWindow: BrowserWindow | null = null
const CACHE_TTL = 10 * 60 * 1000
const packageInfoCache = new Map<string, { expiresAt: number; value: any }>()
const packageSizeCache = new Map<string, { expiresAt: number; value: any }>()

export function setNpmServiceWindow(window: BrowserWindow | null) {
  mainWindow = window
}

function sendCommandLog(id: string, command: string, output?: string, error?: string, status: 'running' | 'success' | 'error' = 'running') {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('command-log', {
        id,
        timestamp: Date.now(),
        command,
        output: output ? output.substring(0, 5000) : undefined,
        error: error ? error.substring(0, 5000) : undefined,
        status
      })
    }
  } catch (e) {
  }
}

function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args.map((arg) => /\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)].join(' ')
}

function getCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string): T | null {
  const item = cache.get(key)
  if (!item) return null
  if (item.expiresAt < Date.now()) {
    cache.delete(key)
    return null
  }
  return item.value
}

function setCached<T>(cache: Map<string, { expiresAt: number; value: T }>, key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL })
  return value
}

function parseJson(stdout: string, fallback: any = null): any {
  if (!stdout.trim()) return fallback
  try {
    return JSON.parse(stdout)
  } catch {
    return fallback
  }
}

function normalizePackageSpec(packageName: string, version?: string): string {
  return version ? `${packageName}@${version}` : packageName
}

function registryPackageUrl(packageName: string, version = 'latest'): string {
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`
}

async function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { resolve(data) })
    }).on('error', reject)
  })
}

export class NpmService {
  private async executeNpm(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const logId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
    const command = formatCommand('npm', args)
    
    sendCommandLog(logId, command, undefined, undefined, 'running')
    
    try {
      const result = await execFileAsync(NPM_BIN, args, {
        cwd: cwd || process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env },
        windowsHide: true
      })
      
      sendCommandLog(logId, command, result.stdout, result.stderr, 'success')
      return result
    } catch (error: any) {
      sendCommandLog(logId, command, error.stdout, error.stderr || error.message, 'error')
      const wrapped = new Error(error.message || 'Command execution failed') as Error & { stdout?: string; stderr?: string; code?: number }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      wrapped.code = error.code
      throw wrapped
    }
  }

  async search(query: string): Promise<any[]> {
    const { stdout } = await this.executeNpm(['search', query, '--json', '--long'])
    return parseJson(stdout, [])
  }

  async view(packageName: string): Promise<any> {
    const { stdout } = await this.executeNpm(['view', packageName, '--json'])
    return parseJson(stdout, null)
  }

  async install(args: any): Promise<string> {
    const { packageName, cwd, global, dev, version } = args
    const command = ['install', normalizePackageSpec(packageName, version)]
    if (global) command.push('-g')
    if (dev) command.push('--save-dev')
    command.push('--legacy-peer-deps')
    
    const { stdout, stderr } = await this.executeNpm(command, cwd)
    return stdout || stderr
  }

  async uninstall(args: any): Promise<string> {
    const { packageName, cwd, global } = args
    const command = ['uninstall', packageName]
    if (global) command.push('-g')
    
    const { stdout, stderr } = await this.executeNpm(command, cwd)
    return stdout || stderr
  }

  async update(args: any): Promise<string> {
    const { packageName, cwd, global } = args
    
    if (packageName) {
      const command = ['install', `${packageName}@latest`, '--legacy-peer-deps']
      if (global) command.push('-g')
      
      const { stdout, stderr } = await this.executeNpm(command, cwd)
      return stdout || stderr
    } else {
      const command = ['update', '--legacy-peer-deps']
      if (global) command.push('-g')
      
      const { stdout, stderr } = await this.executeNpm(command, cwd)
      return stdout || stderr
    }
  }

  async outdated(cwd: string): Promise<any> {
    try {
      const { stdout } = await this.executeNpm(['outdated', '--json'], cwd)
      return parseJson(stdout, {})
    } catch (error: any) {
      if (error.stdout) {
        return parseJson(error.stdout, {})
      }
      return {}
    }
  }

  async list(cwd: string, global: boolean): Promise<any> {
    const command = ['list', '--json', '--depth=0']
    if (global) command.push('-g')
    const { stdout } = await this.executeNpm(command, global ? undefined : cwd)
    return parseJson(stdout, {})
  }

  async configList(): Promise<any> {
    const { stdout } = await this.executeNpm(['config', 'list', '--json'])
    return parseJson(stdout, {})
  }

  async configSet(key: string, value: string): Promise<void> {
    await this.executeNpm(['config', 'set', key, value])
  }

  async whoami(): Promise<string> {
    try {
      const { stdout } = await this.executeNpm(['whoami'])
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async login(registry?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['login']
      if (registry) {
        args.push('--registry', registry)
      }
      
      const child = spawn(NPM_BIN, args, {
        stdio: 'inherit',
        shell: false,
        windowsHide: true
      })
      
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error('Login failed'))
      })
    })
  }

  async logout(registry?: string): Promise<void> {
    const command = ['logout']
    if (registry) command.push('--registry', registry)
    await this.executeNpm(command)
  }

  async runScript(cwd: string, script: string): Promise<string> {
    const { stdout, stderr } = await this.executeNpm(['run', script], cwd)
    return stdout || stderr
  }

  async getScripts(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await this.executeNpm(['pkg', 'get', 'scripts', '--json'], cwd)
      const result = parseJson(stdout, {})
      return Object.keys(result || {})
    } catch (error) {
      return []
    }
  }

  async configGet(key: string): Promise<string> {
    try {
      const { stdout } = await this.executeNpm(['config', 'get', key])
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async configDelete(key: string): Promise<void> {
    await this.executeNpm(['config', 'delete', key])
  }

  async configEdit(): Promise<void> {
    await this.executeNpm(['config', 'edit'])
  }

  async moveDependency(args: any): Promise<string> {
    const { packageName, cwd, from, to } = args
    
    await this.uninstall({ packageName, cwd, global: false })
    
    return await this.install({
      packageName,
      cwd,
      global: false,
      dev: to === 'devDependencies'
    })
  }

  async getPublishedPackages(username: string): Promise<any[]> {
    try {
      const { stdout } = await this.executeNpm(['search', `maintainer:${username}`, '--json', '--long'])
      return parseJson(stdout, [])
    } catch (error) {
      return []
    }
  }

  async checkAllOutdated(cwd: string): Promise<any> {
    return await this.outdated(cwd)
  }

  async getPackageInfo(packageName: string): Promise<any> {
    const cached = getCached(packageInfoCache, packageName)
    if (cached) return cached

    try {
      const { stdout } = await this.executeNpm(['info', packageName, '--json'])
      return setCached(packageInfoCache, packageName, parseJson(stdout, null))
    } catch (error) {
      return null
    }
  }

  async getVersions(packageName: string): Promise<string[]> {
    try {
      const { stdout } = await this.executeNpm(['view', packageName, 'versions', '--json'])
      const versions = parseJson(stdout, [])
      return Array.isArray(versions) ? versions.reverse() : [versions]
    } catch (error) {
      return []
    }
  }

  async installVersion(args: any): Promise<string> {
    const { packageName, version, cwd, global, dev } = args
    const command = ['install', normalizePackageSpec(packageName, version)]
    if (global) command.push('-g')
    if (dev) command.push('--save-dev')
    command.push('--legacy-peer-deps')
    
    const { stdout, stderr } = await this.executeNpm(command, cwd)
    return stdout || stderr
  }

  async globalOutdated(): Promise<any> {
    try {
      const { stdout } = await this.executeNpm(['outdated', '-g', '--json'])
      return parseJson(stdout, {})
    } catch (error: any) {
      if (error.stdout) {
        return parseJson(error.stdout, {})
      }
      return {}
    }
  }

  async adduser(registry?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['adduser']
      if (registry) {
        args.push('--registry', registry)
      }
      
      const child = spawn(NPM_BIN, args, {
          stdio: 'inherit',
          shell: false,
          windowsHide: true
      })
      
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error('Add user failed'))
      })
    })
  }

  async getRegistryInfo(registry?: string): Promise<any> {
    try {
      let url = 'https://registry.npmjs.org/'
      if (registry) {
        url = registry
      }
      const data = await httpsGet(url)
      return JSON.parse(data)
    } catch (error) {
      return null
    }
  }

  async getPackageSize(packageName: string, version?: string): Promise<any> {
    const cacheKey = `${packageName}@${version || 'latest'}`
    const cached = getCached(packageSizeCache, cacheKey)
    if (cached) return cached

    try {
      const pkgVersion = version || 'latest'
      const url = registryPackageUrl(packageName, pkgVersion)
      const data = JSON.parse(await httpsGet(url))
      
      const dist = data.dist || {}
      const unpackedSize = dist.unpackedSize || 0
      const fileCount = dist.fileCount || 0
      
      return setCached(packageSizeCache, cacheKey, {
        unpackedSize,
        fileCount,
        packedSize: dist.tarball ? 'unknown' : 0,
        prettySize: formatBytes(unpackedSize)
      })
    } catch (error) {
      return { unpackedSize: 0, fileCount: 0, prettySize: 'unknown' }
    }
  }

  async getDependencyTree(packageName: string, version?: string, depth: number = 2): Promise<any> {
    try {
      const pkgVersion = version || 'latest'
      const { stdout } = await this.executeNpm(['view', normalizePackageSpec(packageName, pkgVersion), 'dependencies', '--json'])
      const dependencies = parseJson(stdout, {})
      
      if (!dependencies || Object.keys(dependencies).length === 0) {
        return { name: packageName, version: pkgVersion, dependencies: [] }
      }
      
      const tree: any = {
        name: packageName,
        version: pkgVersion,
        dependencies: []
      }
      
      if (depth > 0) {
        for (const [depName, depVersion] of Object.entries(dependencies)) {
          const subTree = await this.getDependencyTree(depName, depVersion as string, depth - 1)
          tree.dependencies.push(subTree)
        }
      } else {
        for (const [depName, depVersion] of Object.entries(dependencies)) {
          tree.dependencies.push({ name: depName, version: depVersion, dependencies: [] })
        }
      }
      
      return tree
    } catch (error) {
      return { name: packageName, version: version || 'latest', dependencies: [] }
    }
  }

  async audit(cwd: string): Promise<any> {
    try {
      const { stdout } = await this.executeNpm(['audit', '--json'], cwd)
      return parseJson(stdout, { vulnerabilities: {} })
    } catch (error: any) {
      if (error.stdout) {
        try {
          return parseJson(error.stdout, { vulnerabilities: {} })
        } catch {
          return { vulnerabilities: {} }
        }
      }
      return { vulnerabilities: {} }
    }
  }

  async auditFix(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeNpm(['audit', 'fix'], cwd)
    return stdout || stderr
  }

  async getPackageReadme(packageName: string): Promise<string> {
    try {
      const data = JSON.parse(await httpsGet(registryPackageUrl(packageName)))
      return data.readme || 'No README available'
    } catch (error) {
      return 'No README available'
    }
  }

  async getDependents(packageName: string): Promise<number> {
    try {
      const data = JSON.parse(await httpsGet(`https://registry.npmjs.org/-/v1/search?text=dependencies:${packageName}&size=0`))
      return data.total || 0
    } catch (error) {
      return 0
    }
  }

  async downloadStats(packageName: string): Promise<any> {
    try {
      const lastWeek = await httpsGet(`https://api.npmjs.org/downloads/point/last-week/${packageName}`)
      return JSON.parse(lastWeek)
    } catch (error) {
      return { downloads: 0 }
    }
  }

  async getProjectDependencyTree(cwd: string, depth: number = 2): Promise<any> {
    try {
      const { stdout } = await this.executeNpm(['list', '--json', `--depth=${depth}`], cwd)
      return parseJson(stdout, { dependencies: {} })
    } catch (error: any) {
      if (error.stdout) {
        try {
          return parseJson(error.stdout, { dependencies: {} })
        } catch {
          return { dependencies: {} }
        }
      }
      return { dependencies: {} }
    }
  }

  async getGlobalDependencyTree(depth: number = 1): Promise<any> {
    try {
      const { stdout } = await this.executeNpm(['list', '-g', '--json', `--depth=${depth}`])
      return parseJson(stdout, { dependencies: {} })
    } catch (error: any) {
      if (error.stdout) {
        try {
          return parseJson(error.stdout, { dependencies: {} })
        } catch {
          return { dependencies: {} }
        }
      }
      return { dependencies: {} }
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
