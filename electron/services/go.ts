import { access, readFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export interface GoModuleDependency {
  path: string
  version: string
  latest?: string
  indirect?: boolean
  replace?: string
  description?: string
  repositoryUrl?: string
  stars?: number
}

export interface GoInstallArgs {
  modulePath: string
  version?: string
  cwd: string
}

export class GoService {
  private async executeGo(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await runLoggedCommand(await resolveToolBin('go', cwd), args, {
        cwd,
        maxBuffer: 1024 * 1024 * 30,
        displayBin: 'go'
      })
    } catch (error: any) {
      const wrapped = new Error(error.message || 'go command failed') as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      throw wrapped
    }
  }

  async detect(cwd: string): Promise<{ hasGoMod: boolean; path: string }> {
    const goModPath = join(cwd, 'go.mod')
    try {
      await access(goModPath)
      return { hasGoMod: true, path: goModPath }
    } catch {
      return { hasGoMod: false, path: goModPath }
    }
  }

  async list(cwd: string): Promise<GoModuleDependency[]> {
    const declared = await this.readDeclared(cwd)
    try {
      const { stdout } = await this.executeGo(['list', '-m', '-u', '-json', 'all'], cwd)
      const modules = parseGoJsonStream(stdout)
      const rootPath = modules[0]?.Path
      return modules
        .filter((module) => module.Path && module.Path !== rootPath)
        .map((module) => ({
          path: module.Path,
          version: module.Version || '',
          latest: module.Update?.Version,
          indirect: declared.get(module.Path)?.indirect,
          replace: module.Replace?.Path
            ? `${module.Replace.Path}${module.Replace.Version ? `@${module.Replace.Version}` : ''}`
            : undefined
        }))
    } catch {
      return [...declared.values()]
    }
  }

  async search(query: string, cwd?: string): Promise<GoModuleDependency[]> {
    const normalized = query.trim()
    if (!normalized) return []

    const localMatches = cwd && await fileExists(join(cwd, 'go.mod'))
      ? (await this.readDeclared(cwd)).values()
      : []
    const matches = [...localMatches].filter((item) => item.path.toLowerCase().includes(normalized.toLowerCase()))
    const results: GoModuleDependency[] = [...matches]

    try {
      const versions = await this.versions(normalized, cwd)
      if (versions.length > 0) {
        results.unshift(
          { path: normalized, version: versions[0] },
        )
      }
    } catch {
    }

    if (looksLikeGithubModule(normalized)) {
      results.push(githubModuleFromPath(normalized))
    }

    try {
      results.push(...await searchGithubGoModules(normalized))
    } catch {
    }

    return uniqueGoModules(results).slice(0, 20)
  }

  async versions(modulePath: string, cwd?: string): Promise<string[]> {
    if (!modulePath.trim()) return []
    try {
      const { stdout } = await this.executeGo(['list', '-m', '-versions', modulePath.trim()], cwd)
      const versions = stdout
        .trim()
        .split(/\s+/)
        .slice(1)
        .reverse()
        .slice(0, 40)
      if (versions.length > 0) return versions
    } catch {
    }

    if (looksLikeGithubModule(modulePath)) {
      return await githubTags(modulePath)
    }

    return []
  }

  async install(args: GoInstallArgs): Promise<string> {
    const spec = args.version ? `${args.modulePath}@${args.version}` : args.modulePath
    const { stdout, stderr } = await this.executeGo(['get', spec], args.cwd)
    const tidyOutput = await this.tidy(args.cwd)
    return [stdout || stderr, tidyOutput].filter(Boolean).join('\n')
  }

  async uninstall(args: { modulePath: string; cwd: string }): Promise<string> {
    const { stdout, stderr } = await this.executeGo(['get', `${args.modulePath}@none`], args.cwd)
    const tidyOutput = await this.tidy(args.cwd)
    return [stdout || stderr, tidyOutput].filter(Boolean).join('\n')
  }

  async update(args: { modulePath?: string; cwd: string }): Promise<string> {
    const target = args.modulePath ? `${args.modulePath}@latest` : './...'
    const { stdout, stderr } = await this.executeGo(['get', '-u', target], args.cwd)
    const tidyOutput = await this.tidy(args.cwd)
    return [stdout || stderr, tidyOutput].filter(Boolean).join('\n')
  }

  async tidy(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeGo(['mod', 'tidy'], cwd)
    return stdout || stderr
  }

  async graph(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeGo(['mod', 'graph'], cwd)
    return stdout || stderr
  }

  async audit(cwd: string): Promise<{ raw: string; error?: string }> {
    try {
      const { stdout, stderr } = await runLoggedCommand(process.platform === 'win32' ? 'govulncheck.exe' : 'govulncheck', ['-json', './...'], {
        cwd,
        maxBuffer: 1024 * 1024 * 30,
        displayBin: 'govulncheck'
      })
      return { raw: stdout || stderr }
    } catch (error: any) {
      return {
        raw: error.stdout || error.stderr || '',
        error: error.stderr || error.message || 'govulncheck is not available'
      }
    }
  }

  async run(cwd: string, commandLine: string): Promise<string> {
    const args = splitCommandLine(commandLine)
    if (args.length === 0) throw new Error('Go command is required')
    const { stdout, stderr } = await this.executeGo(args, cwd)
    return stdout || stderr
  }

  private async readDeclared(cwd: string): Promise<Map<string, GoModuleDependency>> {
    const content = await readFile(join(cwd, 'go.mod'), 'utf-8')
    return parseGoModDependencies(content)
  }
}

function parseGoModDependencies(content: string): Map<string, GoModuleDependency> {
  const dependencies = new Map<string, GoModuleDependency>()
  let inRequireBlock = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//')) continue

    if (line === 'require (') {
      inRequireBlock = true
      continue
    }

    if (inRequireBlock && line === ')') {
      inRequireBlock = false
      continue
    }

    const requireLine = inRequireBlock ? line : line.replace(/^require\s+/, '')
    if (!inRequireBlock && !line.startsWith('require ')) continue

    const match = requireLine.match(/^(\S+)\s+(\S+)(?:\s+\/\/\s*(indirect))?/)
    if (!match) continue

    dependencies.set(match[1], {
      path: match[1],
      version: match[2],
      indirect: match[3] === 'indirect'
    })
  }

  return dependencies
}

function parseGoJsonStream(stdout: string): any[] {
  const items: any[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < stdout.length; index++) {
    const char = stdout[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = index
      depth++
      continue
    }

    if (char === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try {
          items.push(JSON.parse(stdout.slice(start, index + 1)))
        } catch {
        }
        start = -1
      }
    }
  }

  return items
}

function uniqueGoModules(items: GoModuleDependency[]): GoModuleDependency[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.path)) return false
    seen.add(item.path)
    return true
  })
}

function looksLikeGithubModule(value: string): boolean {
  return /^github\.com\/[^/\s]+\/[^/\s]+/.test(value.trim())
}

function githubModuleFromPath(modulePath: string): GoModuleDependency {
  const normalized = modulePath.replace(/\/$/, '')
  return {
    path: normalized,
    version: '',
    repositoryUrl: `https://${normalized.split('/').slice(0, 3).join('/')}`
  }
}

async function searchGithubGoModules(query: string): Promise<GoModuleDependency[]> {
  const normalized = query.replace(/^github\.com\//, '').trim()
  if (!normalized) return []

  const searchQuery = `${normalized} language:Go`
  const data = JSON.parse(await httpsGet(`https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=stars&order=desc&per_page=15`))
  const items = Array.isArray(data.items) ? data.items : []

  return items.map((repo: any) => ({
    path: `github.com/${repo.full_name}`,
    version: '',
    description: repo.description || '',
    repositoryUrl: repo.html_url,
    stars: repo.stargazers_count || 0
  })).filter((item: GoModuleDependency) => item.path)
}

async function githubTags(modulePath: string): Promise<string[]> {
  const [, owner, repo] = modulePath.trim().match(/^github\.com\/([^/\s]+)\/([^/\s]+)/) || []
  if (!owner || !repo) return []

  try {
    const data = JSON.parse(await httpsGet(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=40`))
    return Array.isArray(data)
      ? data.map((item: any) => item.name).filter(Boolean)
      : []
  } catch {
    return []
  }
}

async function httpsGet(url: string): Promise<string> {
  const https = await import('https')
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'npmDesktopManager' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}
