import { access, copyFile, mkdir, readFile, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { homedir } from 'os'
import { runLoggedCommand } from './commandRunner'
import { getToolchainConfig } from './toolchain'

export interface PipPackage {
  name: string
  version: string
  latest?: string
  latest_version?: string
  latest_filetype?: string
  type?: string
}

export interface PipPackageDetail {
  name: string
  version: string
  summary?: string
  homePage?: string
  author?: string
  license?: string
  location?: string
  requires?: string
  requiredBy?: string
}

export type PipConfigScope = 'user' | 'global' | 'site'

export interface PipConfigItem {
  key: string
  value: string
}

export interface PipAuditIssue {
  name: string
  version: string
  id: string
  fixVersions: string[]
  description: string
  aliases?: string[]
}

export interface PipSearchResult {
  name: string
  version?: string
  description?: string
}

export interface PipCommandOptions {
  cwd?: string
  user?: boolean
  breakSystemPackages?: boolean
}

function parseJson<T>(stdout: string, fallback: T): T {
  if (!stdout.trim()) return fallback
  try {
    return JSON.parse(stdout) as T
  } catch {
    return fallback
  }
}

export class PipService {
  private async executePip(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const configured = (await getToolchainConfig()).pip
    if (configured) {
      const candidates = await getConfiguredPipCandidates(configured, args)
      let lastError: any
      for (const candidate of candidates) {
        try {
          return await runLoggedCommand(candidate.bin, candidate.args, {
            cwd,
            maxBuffer: 1024 * 1024 * 10,
            displayBin: candidate.bin
          })
        } catch (error: any) {
          lastError = error
        }
      }
      throw lastError || new Error('Configured pip path is not available')
    }

    const candidates = process.platform === 'win32'
      ? [
          { bin: 'python.exe', prefix: ['-m', 'pip'] },
          { bin: 'py.exe', prefix: ['-m', 'pip'] },
          { bin: 'pip.exe', prefix: [] }
        ]
      : [
          { bin: 'python3', prefix: ['-m', 'pip'] },
          { bin: 'python', prefix: ['-m', 'pip'] },
          { bin: 'pip3', prefix: [] },
          { bin: 'pip', prefix: [] }
        ]

    let lastError: any
    for (const candidate of candidates) {
      const fullArgs = [...candidate.prefix, ...args]
      try {
        return await runLoggedCommand(candidate.bin, fullArgs, {
          cwd,
          maxBuffer: 1024 * 1024 * 10,
          displayBin: candidate.bin
        })
      } catch (error: any) {
        lastError = error
        if (error.code !== 'ENOENT') {
          const wrapped = new Error(error.message || 'pip command failed') as Error & { stdout?: string; stderr?: string }
          wrapped.stdout = error.stdout
          wrapped.stderr = error.stderr
          throw wrapped
        }
      }
    }

    throw new Error(lastError?.message || 'pip is not available')
  }

  async list(options?: string | PipCommandOptions): Promise<PipPackage[]> {
    const normalized = this.normalizeOptions(options)
    const command = ['list', '--format=json']
    if (normalized.user) command.push('--user')
    const { stdout } = await this.executePip(command, normalized.cwd)
    return parseJson<PipPackage[]>(stdout, [])
  }

  async outdated(options?: string | PipCommandOptions): Promise<PipPackage[]> {
    const normalized = this.normalizeOptions(options)
    const command = ['list', '--outdated', '--format=json']
    if (normalized.user) command.push('--user')
    const { stdout } = await this.executePip(command, normalized.cwd)
    return parseJson<PipPackage[]>(stdout, []).map((pkg: any) => ({
      ...pkg,
      latest: pkg.latest || pkg.latest_version,
      type: pkg.type || pkg.latest_filetype
    }))
  }

  async install(args: {
    packageName?: string
    version?: string
    cwd?: string
    requirements?: boolean
    user?: boolean
    upgrade?: boolean
    indexUrl?: string
    extraIndexUrl?: string
    trustedHost?: string
    breakSystemPackages?: boolean
  }): Promise<string> {
    const command = ['install']
    if (args.upgrade) command.push('--upgrade')
    if (args.user) command.push('--user')
    if (args.breakSystemPackages) command.push('--break-system-packages')
    if (args.indexUrl) command.push('--index-url', args.indexUrl)
    if (args.extraIndexUrl) command.push('--extra-index-url', args.extraIndexUrl)
    if (args.trustedHost) command.push('--trusted-host', args.trustedHost)

    if (args.requirements) {
      command.push('-r', 'requirements.txt')
    } else if (args.packageName) {
      command.push(args.version ? `${args.packageName}==${args.version}` : args.packageName)
    } else {
      throw new Error('Package name is required')
    }

    const { stdout, stderr } = await this.executePip(command, args.cwd)
    return stdout || stderr
  }

  async uninstall(args: { packageName: string; cwd?: string }): Promise<string> {
    const { stdout, stderr } = await this.executePip(['uninstall', '-y', args.packageName], args.cwd)
    return stdout || stderr
  }

  async update(args: { packageName: string; cwd?: string; user?: boolean; breakSystemPackages?: boolean }): Promise<string> {
    const command = ['install', '--upgrade']
    if (args.user) command.push('--user')
    if (args.breakSystemPackages) command.push('--break-system-packages')
    command.push(args.packageName)
    const { stdout, stderr } = await this.executePip(command, args.cwd)
    return stdout || stderr
  }

  async updateAll(args: PipCommandOptions = {}): Promise<{ success: number; failed: number; output: string }> {
    const outdated = await this.outdated(args)
    let success = 0
    let failed = 0
    const output: string[] = []

    for (const pkg of outdated) {
      try {
        output.push(await this.update({ packageName: pkg.name, cwd: args.cwd, user: args.user, breakSystemPackages: args.breakSystemPackages }))
        success++
      } catch (error: any) {
        output.push(`${pkg.name}: ${error.message}`)
        failed++
      }
    }

    return { success, failed, output: output.join('\n') }
  }

  async freeze(cwd?: string): Promise<string> {
    const { stdout } = await this.executePip(['freeze'], cwd)
    return stdout
  }

  async exportRequirements(cwd: string): Promise<void> {
    const content = await this.freeze(cwd)
    await writeFile(join(cwd, 'requirements.txt'), content, 'utf-8')
  }

  async readRequirements(cwd: string): Promise<string[]> {
    const filePath = join(cwd, 'requirements.txt')
    try {
      await access(filePath)
      const content = await readFile(filePath, 'utf-8')
      return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    } catch {
      return []
    }
  }

  async show(packageName: string, cwd?: string): Promise<PipPackageDetail | null> {
    try {
      const { stdout } = await this.executePip(['show', packageName], cwd)
      return parsePipShow(stdout)
    } catch {
      return null
    }
  }

  async search(query: string, cwd?: string): Promise<PipSearchResult[]> {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []

    const common = [
      'requests', 'numpy', 'pandas', 'flask', 'django', 'fastapi', 'uvicorn', 'pytest',
      'black', 'ruff', 'pydantic', 'sqlalchemy', 'scipy', 'matplotlib', 'beautifulsoup4',
      'httpx', 'aiohttp', 'click', 'typer', 'pip-audit', 'pipdeptree'
    ]
      .filter((name) => name.includes(normalized))
      .slice(0, 10)
      .map((name) => ({ name }))

    try {
      const installed = await this.list(cwd)
      const installedMatches = installed
        .filter((pkg) => pkg.name.toLowerCase().includes(normalized))
        .map((pkg) => ({ name: pkg.name, version: pkg.version }))
      return uniquePipResults([...installedMatches, ...common]).slice(0, 10)
    } catch {
      return common
    }
  }

  async versions(packageName: string): Promise<string[]> {
    if (!packageName.trim()) return []
    try {
      const data = JSON.parse(await httpsGet(`https://pypi.org/pypi/${encodeURIComponent(packageName.trim())}/json`))
      return Object.keys(data.releases || {})
        .filter(Boolean)
        .sort(compareLooseVersions)
        .reverse()
        .slice(0, 10)
    } catch {
      return []
    }
  }

  async check(cwd?: string): Promise<string> {
    try {
      const { stdout, stderr } = await this.executePip(['check'], cwd)
      return stdout || stderr
    } catch (error: any) {
      return error.stdout || error.stderr || error.message
    }
  }

  async audit(cwd?: string): Promise<{ issues: PipAuditIssue[]; raw: string; error?: string }> {
    try {
      const { stdout } = await this.executePipAudit(['-f', 'json'], cwd)
      const parsed = parseJson<any>(stdout, { dependencies: [], vulnerabilities: [] })
      return {
        issues: parsePipAuditIssues(parsed),
        raw: stdout
      }
    } catch (error: any) {
      if (error.stdout) {
        const parsed = parseJson<any>(error.stdout, { dependencies: [], vulnerabilities: [] })
        const issues = parsePipAuditIssues(parsed)
        if (issues.length > 0) {
          return {
            issues,
            raw: error.stdout
          }
        }
      }
      return {
        issues: [],
        raw: error.stdout || error.stderr || '',
        error: error.stderr || error.message || 'pip-audit is not available'
      }
    }
  }

  async installTool(tool: 'pip-audit' | 'pipdeptree', cwd?: string): Promise<string> {
    const { stdout, stderr } = await this.executePip(['install', '--upgrade', tool], cwd)
    return stdout || stderr
  }

  async dependencyTree(cwd?: string): Promise<any> {
    try {
      const { stdout } = await this.executePipDeptree(['--json-tree'], cwd)
      return parseJson(stdout, [])
    } catch {
      const packages = await this.list(cwd)
      const details = await Promise.all(packages.map(async (pkg) => this.show(pkg.name, cwd)))
      return details.filter(Boolean).map((detail) => ({
        package_name: detail!.name,
        installed_version: detail!.version,
        dependencies: parseRequires(detail!.requires).map((name) => ({
          package_name: name,
          installed_version: '',
          dependencies: []
        }))
      }))
    }
  }

  async configList(scope: PipConfigScope = 'user'): Promise<PipConfigItem[]> {
    const { stdout } = await this.executePip(['config', ...this.scopeArgs(scope), 'list'])
    return parsePipConfig(stdout)
  }

  async configFile(scope: PipConfigScope = 'user'): Promise<string> {
    return pipConfigPath(scope)
  }

  async backupConfig(scope: PipConfigScope = 'user'): Promise<string> {
    const filePath = pipConfigPath(scope)
    await mkdir(dirname(filePath), { recursive: true })
    try {
      await access(filePath)
    } catch {
      await writeFile(filePath, '', 'utf-8')
    }
    const backupPath = `${filePath}.bak`
    await copyFile(filePath, backupPath)
    return backupPath
  }

  async configSet(scope: PipConfigScope, key: string, value: string): Promise<void> {
    await this.executePip(['config', ...this.scopeArgs(scope), 'set', key, value])
  }

  async configUnset(scope: PipConfigScope, key: string): Promise<void> {
    await this.executePip(['config', ...this.scopeArgs(scope), 'unset', key])
  }

  async cacheDir(): Promise<string> {
    const { stdout } = await this.executePip(['cache', 'dir'])
    return stdout.trim()
  }

  async cachePurge(): Promise<string> {
    const { stdout, stderr } = await this.executePip(['cache', 'purge'])
    return stdout || stderr
  }

  private normalizeOptions(options?: string | PipCommandOptions): PipCommandOptions {
    return typeof options === 'string' ? { cwd: options } : options || {}
  }

  private scopeArgs(scope: PipConfigScope): string[] {
    return [`--${scope}`]
  }

  private async executePipAudit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const candidates = process.platform === 'win32'
      ? [
          { bin: 'python.exe', args: ['-m', 'pip_audit', ...args] },
          { bin: 'py.exe', args: ['-m', 'pip_audit', ...args] },
          { bin: 'pip-audit.exe', args }
        ]
      : [
          { bin: 'python3', args: ['-m', 'pip_audit', ...args] },
          { bin: 'python', args: ['-m', 'pip_audit', ...args] },
          { bin: 'pip-audit', args }
        ]

    return await this.executeExternalCandidates(candidates, cwd)
  }

  private async executePipDeptree(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const candidates = process.platform === 'win32'
      ? [
          { bin: 'python.exe', args: ['-m', 'pipdeptree', ...args] },
          { bin: 'py.exe', args: ['-m', 'pipdeptree', ...args] },
          { bin: 'pipdeptree.exe', args }
        ]
      : [
          { bin: 'python3', args: ['-m', 'pipdeptree', ...args] },
          { bin: 'python', args: ['-m', 'pipdeptree', ...args] },
          { bin: 'pipdeptree', args }
        ]

    return await this.executeExternalCandidates(candidates, cwd)
  }

  private async executeExternalCandidates(
    candidates: Array<{ bin: string; args: string[] }>,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string }> {
    let lastError: any
    for (const candidate of candidates) {
      try {
        return await runLoggedCommand(candidate.bin, candidate.args, {
          cwd,
          maxBuffer: 1024 * 1024 * 20,
          displayBin: candidate.bin
        })
      } catch (error: any) {
        lastError = error
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
    }
    throw lastError || new Error('Tool is not available')
  }
}

async function httpsGet(url: string): Promise<string> {
  const https = await import('https')
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function parsePipShow(stdout: string): PipPackageDetail | null {
  const data: Record<string, string> = {}

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (match) {
      data[match[1].trim().toLowerCase()] = match[2].trim()
    }
  }

  if (!data.name) return null

  return {
    name: data.name,
    version: data.version,
    summary: data.summary,
    homePage: data['home-page'],
    author: data.author,
    license: data.license,
    location: data.location,
    requires: data.requires,
    requiredBy: data['required-by']
  }
}

function parsePipConfig(stdout: string): PipConfigItem[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, ...rest] = line.split('=')
      return {
        key: key.trim(),
        value: rest.join('=').trim().replace(/^'|'$/g, '')
      }
    })
    .filter((item) => item.key)
}

function parsePipAuditIssues(parsed: any): PipAuditIssue[] {
  if (Array.isArray(parsed.vulnerabilities)) {
    return parsed.vulnerabilities.map((item: any) => ({
      name: item.name || item.package || item.package_name || '',
      version: item.version || '',
      id: item.id || item.vuln || item.aliases?.[0] || '',
      fixVersions: item.fix_versions || item.fixVersions || [],
      description: item.description || item.summary || item.id || '发现已知安全问题',
      aliases: item.aliases
    })).filter((item: PipAuditIssue) => item.name)
  }

  if (Array.isArray(parsed.dependencies)) {
    return parsed.dependencies.flatMap((dep: any) => {
      const vulns = dep.vulns || dep.vulnerabilities || []
      return vulns.map((item: any) => ({
        name: dep.name || dep.package || '',
        version: dep.version || '',
        id: item.id || item.aliases?.[0] || '',
        fixVersions: item.fix_versions || item.fixVersions || [],
        description: item.description || item.summary || item.id || '发现已知安全问题',
        aliases: item.aliases
      }))
    }).filter((item: PipAuditIssue) => item.name)
  }

  return []
}

function parseRequires(requires?: string): string[] {
  if (!requires) return []
  return requires
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniquePipResults(items: PipSearchResult[]): PipSearchResult[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.name.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareLooseVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function pipConfigPath(scope: PipConfigScope): string {
  if (scope === 'global') {
    if (process.platform === 'win32') {
      return join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'pip', 'pip.ini')
    }
    if (process.platform === 'darwin') {
      return '/Library/Application Support/pip/pip.conf'
    }
    return '/etc/pip.conf'
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'pip', 'pip.ini')
  }

  return join(homedir(), '.config', 'pip', 'pip.conf')
}

async function getConfiguredPipCandidates(configured: string, args: string[]): Promise<Array<{ bin: string; args: string[] }>> {
  if (await isDirectory(configured)) {
    return process.platform === 'win32'
      ? [
          { bin: join(configured, 'python.exe'), args: ['-m', 'pip', ...args] },
          { bin: join(configured, 'py.exe'), args: ['-m', 'pip', ...args] },
          { bin: join(configured, 'Scripts', 'pip.exe'), args },
          { bin: join(configured, 'pip.exe'), args }
        ]
      : [
          { bin: join(configured, 'python3'), args: ['-m', 'pip', ...args] },
          { bin: join(configured, 'python'), args: ['-m', 'pip', ...args] },
          { bin: join(configured, 'bin', 'pip3'), args },
          { bin: join(configured, 'bin', 'pip'), args },
          { bin: join(configured, 'pip'), args }
        ]
  }

  const lowerName = basename(configured).toLowerCase()
  const prefix = lowerName.startsWith('python') || lowerName === 'py.exe' ? ['-m', 'pip'] : []
  return [{ bin: configured, args: [...prefix, ...args] }]
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises')
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
