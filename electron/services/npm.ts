import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export class NpmService {
  private async execute(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execAsync(command, {
        cwd: cwd || process.cwd(),
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env }
      })
      return result
    } catch (error: any) {
      throw new Error(error.message || 'Command execution failed')
    }
  }

  async search(query: string): Promise<any[]> {
    const { stdout } = await this.execute(`npm search ${query} --json --long`)
    return JSON.parse(stdout)
  }

  async view(packageName: string): Promise<any> {
    const { stdout } = await this.execute(`npm view ${packageName} --json`)
    return JSON.parse(stdout)
  }

  async install(args: any): Promise<string> {
    const { packageName, cwd, global, dev, version } = args
    let command = 'npm install'
    
    if (version) {
      command += ` ${packageName}@${version}`
    } else {
      command += ` ${packageName}`
    }
    
    if (global) command += ' -g'
    if (dev) command += ' --save-dev'
    
    const { stdout, stderr } = await this.execute(command, cwd)
    return stdout || stderr
  }

  async uninstall(args: any): Promise<string> {
    const { packageName, cwd, global } = args
    let command = `npm uninstall ${packageName}`
    if (global) command += ' -g'
    
    const { stdout, stderr } = await this.execute(command, cwd)
    return stdout || stderr
  }

  async update(args: any): Promise<string> {
    const { packageName, cwd, global } = args
    let command = 'npm update'
    if (packageName) command += ` ${packageName}`
    if (global) command += ' -g'
    
    const { stdout, stderr } = await this.execute(command, cwd)
    return stdout || stderr
  }

  async outdated(cwd: string): Promise<any> {
    try {
      const { stdout } = await this.execute('npm outdated --json', cwd)
      return stdout ? JSON.parse(stdout) : {}
    } catch (error: any) {
      if (error.stdout) {
        return JSON.parse(error.stdout)
      }
      return {}
    }
  }

  async list(cwd: string, global: boolean): Promise<any> {
    const command = `npm list --json --depth=0${global ? ' -g' : ''}`
    const { stdout } = await this.execute(command, global ? undefined : cwd)
    return JSON.parse(stdout)
  }

  async configList(): Promise<any> {
    const { stdout } = await this.execute('npm config list --json')
    return JSON.parse(stdout)
  }

  async configSet(key: string, value: string): Promise<void> {
    await this.execute(`npm config set ${key} ${value}`)
  }

  async whoami(): Promise<string> {
    try {
      const { stdout } = await this.execute('npm whoami')
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
      
      const child = spawn('npm', args, {
        stdio: 'inherit',
        shell: true
      })
      
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error('Login failed'))
      })
    })
  }

  async logout(registry?: string): Promise<void> {
    let command = 'npm logout'
    if (registry) command += ` --registry ${registry}`
    await this.execute(command)
  }

  async runScript(cwd: string, script: string): Promise<string> {
    const { stdout, stderr } = await this.execute(`npm run ${script}`, cwd)
    return stdout || stderr
  }

  async getScripts(cwd: string): Promise<string[]> {
    try {
      const { stdout } = await this.execute('npm run --json', cwd)
      const result = JSON.parse(stdout)
      return Object.keys(result || {})
    } catch (error) {
      return []
    }
  }

  async configGet(key: string): Promise<string> {
    try {
      const { stdout } = await this.execute(`npm config get ${key}`)
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async configDelete(key: string): Promise<void> {
    await this.execute(`npm config delete ${key}`)
  }

  async configEdit(): Promise<void> {
    await this.execute('npm config edit')
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
      const { stdout } = await this.execute(`npm search maintainer:${username} --json --long`)
      return JSON.parse(stdout)
    } catch (error) {
      return []
    }
  }

  async checkAllOutdated(cwd: string): Promise<any> {
    return await this.outdated(cwd)
  }

  async getPackageInfo(packageName: string): Promise<any> {
    try {
      const { stdout } = await this.execute(`npm info ${packageName} --json`)
      return JSON.parse(stdout)
    } catch (error) {
      return null
    }
  }

  async getVersions(packageName: string): Promise<string[]> {
    try {
      const { stdout } = await this.execute(`npm view ${packageName} versions --json`)
      const versions = JSON.parse(stdout)
      return Array.isArray(versions) ? versions.reverse() : [versions]
    } catch (error) {
      return []
    }
  }

  async installVersion(args: any): Promise<string> {
    const { packageName, version, cwd, global, dev } = args
    return await this.install({
      packageName: `${packageName}@${version}`,
      cwd,
      global,
      dev
    })
  }

  async globalOutdated(): Promise<any> {
    try {
      const { stdout } = await this.execute('npm outdated -g --json')
      return stdout ? JSON.parse(stdout) : {}
    } catch (error: any) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout)
        } catch {
          return {}
        }
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
      
      const child = spawn('npm', args, {
        stdio: 'inherit',
        shell: true
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
      const { stdout } = await execAsync(`curl -s ${url}`)
      return JSON.parse(stdout)
    } catch (error) {
      return null
    }
  }

  async getPackageSize(packageName: string, version?: string): Promise<any> {
    try {
      const pkgVersion = version || 'latest'
      const url = `https://registry.npmjs.org/${packageName}/${pkgVersion}`
      const { stdout } = await execAsync(`curl -s ${url}`)
      const data = JSON.parse(stdout)
      
      const dist = data.dist || {}
      const unpackedSize = dist.unpackedSize || 0
      const fileCount = dist.fileCount || 0
      
      return {
        unpackedSize,
        fileCount,
        packedSize: dist.tarball ? 'unknown' : 0,
        prettySize: formatBytes(unpackedSize)
      }
    } catch (error) {
      return { unpackedSize: 0, fileCount: 0, prettySize: 'unknown' }
    }
  }

  async getDependencyTree(packageName: string, version?: string, depth: number = 2): Promise<any> {
    try {
      const pkgVersion = version || 'latest'
      const { stdout } = await this.execute(`npm view ${packageName}@${pkgVersion} dependencies --json`)
      const dependencies = JSON.parse(stdout)
      
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
      const { stdout } = await this.execute('npm audit --json', cwd)
      return JSON.parse(stdout)
    } catch (error: any) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout)
        } catch {
          return { vulnerabilities: {} }
        }
      }
      return { vulnerabilities: {} }
    }
  }

  async auditFix(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.execute('npm audit fix', cwd)
    return stdout || stderr
  }

  async getPackageReadme(packageName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`curl -s https://registry.npmjs.org/${packageName}/latest`)
      const data = JSON.parse(stdout)
      return data.readme || 'No README available'
    } catch (error) {
      return 'No README available'
    }
  }

  async getDependents(packageName: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`curl -s "https://registry.npmjs.org/-/v1/search?text=dependencies:${packageName}&size=0"`)
      const data = JSON.parse(stdout)
      return data.total || 0
    } catch (error) {
      return 0
    }
  }

  async downloadStats(packageName: string): Promise<any> {
    try {
      const lastWeek = await execAsync(`curl -s "https://api.npmjs.org/downloads/point/last-week/${packageName}"`)
      return JSON.parse(lastWeek)
    } catch (error) {
      return { downloads: 0 }
    }
  }

  async getProjectDependencyTree(cwd: string, depth: number = 2): Promise<any> {
    try {
      const { stdout } = await this.execute(`npm list --json --depth=${depth}`, cwd)
      return JSON.parse(stdout)
    } catch (error: any) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout)
        } catch {
          return { dependencies: {} }
        }
      }
      return { dependencies: {} }
    }
  }

  async getGlobalDependencyTree(depth: number = 1): Promise<any> {
    try {
      const { stdout } = await this.execute(`npm list -g --json --depth=${depth}`)
      return JSON.parse(stdout)
    } catch (error: any) {
      if (error.stdout) {
        try {
          return JSON.parse(error.stdout)
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