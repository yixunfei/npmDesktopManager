import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'fs/promises'
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

export interface PipDependencyTreeNode {
  name: string
  version: string
  dependencies: PipDependencyTreeNode[]
}

export interface PipCommandOptions {
  cwd?: string
  user?: boolean
  breakSystemPackages?: boolean
}

export interface PipRepairResult {
  checkedOutput: string
  actions: string[]
  success: number
  failed: number
  output: string
}

interface PipRepairAction {
  label: string
  spec: string
  packageName?: string
}

export interface PipPublishArgs {
  cwd: string
  repositoryUrl?: string
  username?: string
  password?: string
  buildBefore?: boolean
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
    const configured = (await getToolchainConfig(cwd)).pip
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

  async update(args: { packageName: string; cwd?: string; user?: boolean; version?: string; breakSystemPackages?: boolean }): Promise<string> {
    const command = ['install', '--upgrade']
    if (args.user) command.push('--user')
    if (args.breakSystemPackages) command.push('--break-system-packages')
    command.push(args.version ? `${args.packageName}==${args.version}` : args.packageName)
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

  async repairCheck(cwd?: string): Promise<PipRepairResult> {
    const checkedOutput = await this.check(cwd)
    const repairActions = parsePipCheckRepairActions(checkedOutput)
    const actions = repairActions.map((action) => action.label)
    let success = 0
    let failed = 0
    const output: string[] = [checkedOutput.trim()]

    for (const action of repairActions) {
      if (action.packageName) {
        try {
          output.push(`\n> pip install --upgrade ${action.packageName}`)
          output.push(await this.installWithFallbackIndexes(action.packageName, cwd))
          const nextOutput = await this.check(cwd)
          if (!parsePipCheckRepairActions(nextOutput).some((item) => item.label === action.label)) {
            success++
            continue
          }
          output.push(nextOutput.trim())
        } catch (error: any) {
          output.push(`${action.packageName}: ${error.stderr || error.message}`)
        }
      }

      try {
        output.push(`\n> pip install --upgrade ${action.spec}`)
        output.push(await this.installWithFallbackIndexes(action.spec, cwd))
        success++
      } catch (error: any) {
        output.push(`${action.spec}: ${error.stderr || error.message}`)
        failed++
      }
    }

    return {
      checkedOutput,
      actions,
      success,
      failed,
      output: output.filter(Boolean).join('\n')
    }
  }

  async audit(cwd?: string): Promise<{ issues: PipAuditIssue[]; raw: string; error?: string }> {
    const repairResult = await this.repairCheck(cwd)
    const repairOutput = repairResult.actions.length > 0 ? repairResult.output : ''

    try {
      const { stdout } = await this.executePipAudit(['-f', 'json'], cwd)
      const parsed = parseJson<any>(stdout, { dependencies: [], vulnerabilities: [] })
      return {
        issues: parsePipAuditIssues(parsed),
        raw: [repairOutput, stdout].filter(Boolean).join('\n')
      }
    } catch (error: any) {
      if (isMissingToolError(error, 'pip_audit')) {
        try {
          const installOutput = await this.installTool('pip-audit', cwd)
          const { stdout } = await this.executePipAudit(['-f', 'json'], cwd)
          const parsed = parseJson<any>(stdout, { dependencies: [], vulnerabilities: [] })
          return {
            issues: parsePipAuditIssues(parsed),
            raw: [repairOutput, installOutput, stdout].filter(Boolean).join('\n')
          }
        } catch (retryError: any) {
          return {
            issues: [],
            raw: [repairOutput, retryError.stdout || retryError.stderr || ''].filter(Boolean).join('\n'),
            error: retryError.stderr || retryError.message || 'pip-audit is not available'
          }
        }
      }
      if (error.stdout) {
        const parsed = parseJson<any>(error.stdout, { dependencies: [], vulnerabilities: [] })
        const issues = parsePipAuditIssues(parsed)
        if (issues.length > 0) {
          return {
            issues,
            raw: [repairOutput, error.stdout].filter(Boolean).join('\n')
          }
        }
      }
      return {
        issues: [],
        raw: [repairOutput, error.stdout || error.stderr || ''].filter(Boolean).join('\n'),
        error: error.stderr || error.message || 'pip-audit is not available'
      }
    }
  }

  async installTool(tool: 'pip-audit' | 'pipdeptree', cwd?: string): Promise<string> {
    return await this.installPythonTool(tool, cwd)
  }

  async dependencyTree(cwd?: string): Promise<PipDependencyTreeNode[]> {
    try {
      const { stdout } = await this.executePipDeptree(['--json-tree'], cwd)
      return normalizePipTree(parseJson(stdout, []))
    } catch (error: any) {
      if (isMissingToolError(error, 'pipdeptree')) {
        try {
          await this.installTool('pipdeptree', cwd)
          const { stdout } = await this.executePipDeptree(['--json-tree'], cwd)
          return normalizePipTree(parseJson(stdout, []))
        } catch {
        }
      }
      const packages = await this.list(cwd)
      const details = await Promise.all(packages.map(async (pkg) => this.show(pkg.name, cwd)))
      return details.filter(Boolean).map((detail) => ({
        name: detail!.name,
        version: detail!.version,
        dependencies: parseRequires(detail!.requires).map((name) => ({
          name,
          version: '',
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

  async publish(args: PipPublishArgs): Promise<string> {
    if (!args.cwd) {
      throw new Error('Project path is required')
    }

    const output: string[] = []
    output.push(await this.installPythonTool('twine', args.cwd))

    if (args.buildBefore !== false) {
      output.push(await this.installPythonTool('build', args.cwd))
      const { stdout, stderr } = await this.executePythonModule('build', 'pyproject-build', [], args.cwd)
      output.push(stdout || stderr)
    }

    const distDir = join(args.cwd, 'dist')
    const files = (await readdir(distDir))
      .filter((fileName) => /\.(whl|zip)$/.test(fileName) || fileName.endsWith('.tar.gz'))
      .map((fileName) => join(distDir, fileName))

    if (files.length === 0) {
      throw new Error('dist 目录中没有可发布的 wheel 或源码包，请先构建项目')
    }

    const command = ['upload']
    if (args.repositoryUrl) command.push('--repository-url', args.repositoryUrl)
    if (args.username) command.push('-u', args.username)
    if (args.password) command.push('-p', args.password)
    command.push(...files)

    const { stdout, stderr } = await this.executePythonModule('twine', 'twine', command, args.cwd)
    output.push(stdout || stderr)
    return output.filter(Boolean).join('\n')
  }

  private normalizeOptions(options?: string | PipCommandOptions): PipCommandOptions {
    return typeof options === 'string' ? { cwd: options } : options || {}
  }

  private scopeArgs(scope: PipConfigScope): string[] {
    return [`--${scope}`]
  }

  private async executePipAudit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const configured = (await getToolchainConfig(cwd)).pip
    const configuredCandidates = configured
      ? await getConfiguredModuleCandidates(configured, 'pip_audit', process.platform === 'win32' ? 'pip-audit.exe' : 'pip-audit', args)
      : []
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

    return await this.executeExternalCandidates([...configuredCandidates, ...candidates], cwd)
  }

  private async executePipDeptree(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    const configured = (await getToolchainConfig(cwd)).pip
    const configuredCandidates = configured
      ? await getConfiguredModuleCandidates(configured, 'pipdeptree', process.platform === 'win32' ? 'pipdeptree.exe' : 'pipdeptree', args)
      : []
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

    return await this.executeExternalCandidates([...configuredCandidates, ...candidates], cwd)
  }

  private async executePythonModule(
    moduleName: string,
    executableName: string,
    args: string[],
    cwd?: string
  ): Promise<{ stdout: string; stderr: string }> {
    const configured = (await getToolchainConfig(cwd)).pip
    const executable = process.platform === 'win32' && !executableName.endsWith('.exe')
      ? `${executableName}.exe`
      : executableName
    const configuredCandidates = configured
      ? await getConfiguredModuleCandidates(configured, moduleName, executable, args)
      : []
    const candidates = process.platform === 'win32'
      ? [
          { bin: 'python.exe', args: ['-m', moduleName, ...args] },
          { bin: 'py.exe', args: ['-m', moduleName, ...args] },
          { bin: executable, args }
        ]
      : [
          { bin: 'python3', args: ['-m', moduleName, ...args] },
          { bin: 'python', args: ['-m', moduleName, ...args] },
          { bin: executableName, args }
        ]

    return await this.executeExternalCandidates([...configuredCandidates, ...candidates], cwd)
  }

  private async installPythonTool(tool: string, cwd?: string): Promise<string> {
    const output: string[] = []

    try {
      const { stdout, stderr } = await this.executePip(['install', '--upgrade', tool], cwd)
      return stdout || stderr
    } catch (error: any) {
      output.push(formatFailedPipStep(`安装/升级 ${tool}`, error))
    }

    try {
      const { stdout, stderr } = await this.executePip(['install', '--upgrade', 'pip', 'setuptools', 'wheel'], cwd)
      output.push(stdout || stderr)
    } catch (error: any) {
      output.push(formatFailedPipStep('升级 pip 基础工具', error))
    }

    const fallbackIndexes = [
      {
        label: 'PyPI 官方源',
        args: ['--index-url', 'https://pypi.org/simple', '--trusted-host', 'pypi.org']
      },
      {
        label: '清华 PyPI 镜像',
        args: ['--index-url', 'https://pypi.tuna.tsinghua.edu.cn/simple', '--trusted-host', 'pypi.tuna.tsinghua.edu.cn']
      },
      {
        label: '阿里云 PyPI 镜像',
        args: ['--index-url', 'https://mirrors.aliyun.com/pypi/simple', '--trusted-host', 'mirrors.aliyun.com']
      }
    ]

    for (const fallback of fallbackIndexes) {
      try {
        const { stdout, stderr } = await this.executePip(['install', '--upgrade', ...fallback.args, tool], cwd)
        output.push(`使用${fallback.label}安装成功`)
        output.push(stdout || stderr)
        return output.filter(Boolean).join('\n')
      } catch (error: any) {
        output.push(formatFailedPipStep(`使用${fallback.label}安装 ${tool}`, error))
      }
    }

    const message = output.filter(Boolean).join('\n') || `${tool} 安装失败`
    const wrapped = new Error(message) as Error & { stdout?: string; stderr?: string }
    wrapped.stdout = message
    wrapped.stderr = message
    throw wrapped
  }

  private async installWithFallbackIndexes(packageSpec: string, cwd?: string): Promise<string> {
    try {
      return await this.install({ packageName: packageSpec, cwd, upgrade: true })
    } catch (error: any) {
      const output = [formatFailedPipStep(`使用当前源安装/升级 ${packageSpec}`, error)]
      const fallbackIndexes = [
        { label: 'PyPI 官方源', indexUrl: 'https://pypi.org/simple', trustedHost: 'pypi.org' },
        { label: '清华 PyPI 镜像', indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple', trustedHost: 'pypi.tuna.tsinghua.edu.cn' },
        { label: '阿里云 PyPI 镜像', indexUrl: 'https://mirrors.aliyun.com/pypi/simple', trustedHost: 'mirrors.aliyun.com' }
      ]

      for (const fallback of fallbackIndexes) {
        try {
          const result = await this.install({
            packageName: packageSpec,
            cwd,
            upgrade: true,
            indexUrl: fallback.indexUrl,
            trustedHost: fallback.trustedHost
          })
          return [...output, `使用${fallback.label}安装成功`, result].filter(Boolean).join('\n')
        } catch (retryError: any) {
          output.push(formatFailedPipStep(`使用${fallback.label}安装/升级 ${packageSpec}`, retryError))
        }
      }

      const message = output.filter(Boolean).join('\n')
      const wrapped = new Error(message) as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = message
      wrapped.stderr = message
      throw wrapped
    }
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
        if (error.code !== 'ENOENT' && !isMissingToolError(error)) {
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

function normalizePipTree(items: any): PipDependencyTreeNode[] {
  const list = Array.isArray(items) ? items : [items].filter(Boolean)
  return list.map((item) => ({
    name: item.name || item.package_name || item.key || '',
    version: item.version || item.installed_version || item.latest_version || '',
    dependencies: normalizePipTree(item.dependencies || item.children || item.required_dependencies || [])
  })).filter((item) => item.name)
}

function parsePipCheckRepairActions(output: string): PipRepairAction[] {
  const actions = new Map<string, PipRepairAction>()

  for (const line of output.split(/\r?\n/)) {
    const requirementMatch = line.match(/^(\S+)\s+.+?\s+has requirement\s+([^,]+),\s+but you have/i)
    if (requirementMatch) {
      const packageName = requirementMatch[1].trim()
      const spec = requirementMatch[2].trim()
      const label = `${packageName} -> ${spec}`
      actions.set(label, { label, packageName, spec })
      continue
    }

    const missingMatch = line.match(/^(\S+)\s+.+?\s+requires\s+([^,]+),\s+which is not installed/i)
    if (missingMatch) {
      const packageName = missingMatch[1].trim()
      const spec = missingMatch[2].trim()
      const label = `${packageName} -> ${spec}`
      actions.set(label, { label, packageName, spec })
    }
  }

  return [...actions.values()]
}

function formatFailedPipStep(step: string, error: any): string {
  const detail = error?.stderr || error?.stdout || error?.message || 'unknown error'
  return `${step}失败:\n${detail}`
}

function isMissingToolError(error: any, moduleName?: string): boolean {
  const text = [error?.message, error?.stdout, error?.stderr].filter(Boolean).join('\n')
  if (!text) return false
  if (/No module named/i.test(text)) {
    return moduleName ? text.includes(moduleName) : true
  }
  return /not recognized|not found|ENOENT|is not available/i.test(text)
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

async function getConfiguredModuleCandidates(
  configured: string,
  moduleName: string,
  executableName: string,
  args: string[]
): Promise<Array<{ bin: string; args: string[] }>> {
  if (await isDirectory(configured)) {
    return process.platform === 'win32'
      ? [
          { bin: join(configured, 'python.exe'), args: ['-m', moduleName, ...args] },
          { bin: join(configured, 'py.exe'), args: ['-m', moduleName, ...args] },
          { bin: join(configured, 'Scripts', executableName), args },
          { bin: join(configured, executableName), args }
        ]
      : [
          { bin: join(configured, 'python3'), args: ['-m', moduleName, ...args] },
          { bin: join(configured, 'python'), args: ['-m', moduleName, ...args] },
          { bin: join(configured, 'bin', executableName), args },
          { bin: join(configured, executableName), args }
        ]
  }

  const lowerName = basename(configured).toLowerCase()
  if (lowerName.startsWith('python') || lowerName === 'py.exe') {
    return [{ bin: configured, args: ['-m', moduleName, ...args] }]
  }

  const candidates = [{ bin: configured, args }]
  const configuredDir = dirname(configured)
  candidates.push({ bin: join(configuredDir, executableName), args })
  return candidates
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises')
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
