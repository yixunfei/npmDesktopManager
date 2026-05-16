import { access, readFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export interface CargoDependency {
  name: string
  version: string
  type: 'dependencies' | 'dev-dependencies' | 'build-dependencies'
  source?: string
  optional?: boolean
}

export interface CargoSearchResult {
  name: string
  version?: string
  description?: string
}

export interface CargoInstallArgs {
  packageName: string
  version?: string
  cwd: string
  type?: CargoDependency['type']
  features?: string
}

export class CargoService {
  private async executeCargo(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await runLoggedCommand(await resolveToolBin('cargo', cwd), args, {
        cwd,
        maxBuffer: 1024 * 1024 * 20,
        displayBin: 'cargo'
      })
    } catch (error: any) {
      const wrapped = new Error(error.message || 'cargo command failed') as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      throw wrapped
    }
  }

  async detect(cwd: string): Promise<{ hasCargoToml: boolean; path: string }> {
    const manifestPath = join(cwd, 'Cargo.toml')
    try {
      await access(manifestPath)
      return { hasCargoToml: true, path: manifestPath }
    } catch {
      return { hasCargoToml: false, path: manifestPath }
    }
  }

  async list(cwd: string): Promise<CargoDependency[]> {
    const content = await readFile(join(cwd, 'Cargo.toml'), 'utf-8')
    return parseCargoTomlDependencies(content)
  }

  async search(query: string): Promise<CargoSearchResult[]> {
    if (!query.trim()) return []
    try {
      const { stdout } = await this.executeCargo(['search', query.trim(), '--limit', '20'])
      return parseCargoSearch(stdout)
    } catch {
      try {
        const data = JSON.parse(await httpsGet(`https://crates.io/api/v1/crates?q=${encodeURIComponent(query.trim())}&per_page=20`))
        return (data.crates || []).map((item: any) => ({
          name: item.id || item.name,
          version: item.max_version || item.newest_version || '',
          description: item.description || ''
        })).filter((item: CargoSearchResult) => item.name)
      } catch {
        return []
      }
    }
  }

  async versions(packageName: string): Promise<string[]> {
    if (!packageName.trim()) return []
    try {
      const data = JSON.parse(await httpsGet(`https://crates.io/api/v1/crates/${encodeURIComponent(packageName.trim())}/versions`))
      return (data.versions || [])
        .filter((item: any) => !item.yanked)
        .map((item: any) => item.num)
        .filter(Boolean)
        .slice(0, 30)
    } catch {
      return []
    }
  }

  async install(args: CargoInstallArgs): Promise<string> {
    const command = ['add', args.packageName]
    if (args.version) command.push('--vers', args.version)
    if (args.type === 'dev-dependencies') command.push('--dev')
    if (args.type === 'build-dependencies') command.push('--build')
    if (args.features) command.push('--features', args.features)
    const { stdout, stderr } = await this.executeCargo(command, args.cwd)
    return stdout || stderr
  }

  async uninstall(args: { packageName: string; cwd: string; type?: CargoDependency['type'] }): Promise<string> {
    const command = ['remove', args.packageName]
    if (args.type === 'dev-dependencies') command.push('--dev')
    if (args.type === 'build-dependencies') command.push('--build')
    const { stdout, stderr } = await this.executeCargo(command, args.cwd)
    return stdout || stderr
  }

  async update(args: { packageName?: string; cwd: string }): Promise<string> {
    const command = ['update']
    if (args.packageName) command.push('-p', args.packageName)
    const { stdout, stderr } = await this.executeCargo(command, args.cwd)
    return stdout || stderr
  }

  async tree(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeCargo(['tree'], cwd)
    return stdout || stderr
  }

  async audit(cwd: string): Promise<{ raw: string; error?: string }> {
    try {
      const { stdout, stderr } = await this.executeCargo(['audit', '--json'], cwd)
      return { raw: stdout || stderr }
    } catch (error: any) {
      return {
        raw: error.stdout || error.stderr || '',
        error: error.stderr || error.message || 'cargo-audit is not available'
      }
    }
  }

  async run(cwd: string, commandLine: string): Promise<string> {
    const args = splitCommandLine(commandLine)
    if (args.length === 0) throw new Error('Cargo command is required')
    const { stdout, stderr } = await this.executeCargo(args, cwd)
    return stdout || stderr
  }
}

function parseCargoTomlDependencies(content: string): CargoDependency[] {
  const dependencies: CargoDependency[] = []
  let section: CargoDependency['type'] | null = null

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue

    const sectionMatch = line.match(/^\[([^\]]+)]$/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim()
      section = sectionName === 'dependencies' || sectionName === 'dev-dependencies' || sectionName === 'build-dependencies'
        ? sectionName
        : null
      continue
    }

    if (!section) continue

    const depMatch = line.match(/^"?([^"=\s]+)"?\s*=\s*(.+)$/)
    if (!depMatch) continue

    const keyName = depMatch[1].trim()
    const value = depMatch[2].trim().replace(/,$/, '')
    const packageName = readInlineValue(value, 'package') || keyName
    const version = value.startsWith('"') ? value.replace(/^"|"$/g, '') : readInlineValue(value, 'version')
    const pathSource = readInlineValue(value, 'path')
    const gitSource = readInlineValue(value, 'git')
    const optional = /\boptional\s*=\s*true\b/.test(value)

    dependencies.push({
      name: packageName,
      version,
      type: section,
      source: pathSource ? `path:${pathSource}` : gitSource ? `git:${gitSource}` : undefined,
      optional
    })
  }

  return dependencies
}

function readInlineValue(value: string, key: string): string {
  const match = value.match(new RegExp(`\\b${key}\\s*=\\s*"([^"]+)"`))
  return match?.[1] || ''
}

function parseCargoSearch(output: string): CargoSearchResult[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('...'))
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"\s*#\s*(.*)$/)
      if (!match) return null
      return {
        name: match[1],
        version: match[2],
        description: match[3]
      }
    })
    .filter(Boolean) as CargoSearchResult[]
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

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}
