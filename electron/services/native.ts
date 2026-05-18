import { access, readFile, readdir, writeFile } from 'fs/promises'
import { basename, extname, join, relative } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export type NativeDependencyManager = 'vcpkg' | 'conan' | 'cmake' | 'library'
export type NativeLibraryKind = 'shared' | 'static' | 'import' | 'framework'

export interface NativeDetectResult {
  hasNativeProject: boolean
  hasCMakeLists: boolean
  hasVcpkgManifest: boolean
  hasConanfile: boolean
  cmakePath: string
  vcpkgPath: string
  conanfilePath: string
}

export interface NativeDependencyInfo {
  name: string
  version?: string
  manager: NativeDependencyManager
  source?: string
  kind?: NativeLibraryKind
  path?: string
  linkage?: 'dynamic' | 'static' | 'unknown'
  requiredBy?: string
}

export interface NativeInstallArgs {
  cwd: string
  manager: 'vcpkg' | 'conan'
  name: string
  version?: string
  feature?: string
}

export interface NativeRemoveArgs {
  cwd: string
  manager: 'vcpkg' | 'conan'
  name: string
}

export interface NativeRunArgs {
  cwd: string
  tool: 'cmake' | 'vcpkg' | 'conan'
  commandLine: string
}

const SHARED_LIBRARY_EXTENSIONS = new Set(['.dll', '.so', '.dylib'])
const STATIC_LIBRARY_EXTENSIONS = new Set(['.a'])
const IMPORT_LIBRARY_EXTENSIONS = new Set(['.lib'])
const LIBRARY_SCAN_IGNORES = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.npmDesktopManager',
  'node_modules',
  'dist',
  'dist-electron',
  'release',
  'release-test'
])

export class NativeService {
  async detect(cwd: string): Promise<NativeDetectResult> {
    const cmakePath = join(cwd, 'CMakeLists.txt')
    const vcpkgPath = join(cwd, 'vcpkg.json')
    const conanfilePath = await firstExisting([
      join(cwd, 'conanfile.txt'),
      join(cwd, 'conanfile.py')
    ]) || join(cwd, 'conanfile.txt')

    const [hasCMakeLists, hasVcpkgManifest, hasConanfile] = await Promise.all([
      fileExists(cmakePath),
      fileExists(vcpkgPath),
      fileExists(conanfilePath)
    ])

    return {
      hasNativeProject: hasCMakeLists || hasVcpkgManifest || hasConanfile,
      hasCMakeLists,
      hasVcpkgManifest,
      hasConanfile,
      cmakePath,
      vcpkgPath,
      conanfilePath
    }
  }

  async list(cwd: string): Promise<NativeDependencyInfo[]> {
    const [vcpkg, conan, cmake, libraries] = await Promise.all([
      this.readVcpkgManifest(cwd),
      this.readConanfile(cwd),
      this.readCMakeLinks(cwd),
      scanNativeLibraries(cwd)
    ])
    return uniqueNativeDependencies([...vcpkg, ...conan, ...cmake, ...libraries])
  }

  async search(query: string): Promise<NativeDependencyInfo[]> {
    const normalized = query.trim()
    if (!normalized) return []

    const results: NativeDependencyInfo[] = []

    try {
      const { stdout } = await this.executeVcpkg(['search', normalized])
      results.push(...parseVcpkgSearch(stdout))
    } catch {
    }

    try {
      const { stdout } = await this.executeConan(['search', `${normalized}*`, '-r=all'])
      results.push(...parseConanSearch(stdout))
    } catch {
    }

    if (results.length === 0) {
      results.push(...COMMON_NATIVE_PACKAGES
        .filter((item) => item.name.includes(normalized.toLowerCase()))
        .map((item) => ({ ...item })))
    }

    return uniqueNativeDependencies(results).slice(0, 30)
  }

  async install(args: NativeInstallArgs): Promise<string> {
    if (!args.name.trim()) {
      throw new Error('Native dependency name is required')
    }

    if (args.manager === 'vcpkg') {
      await this.addVcpkgDependency(args.cwd, args.name.trim(), args.version, args.feature)
      return `vcpkg manifest updated: ${args.name}`
    }

    await this.addConanRequirement(args.cwd, args.name.trim(), args.version)
    return `conanfile.txt updated: ${formatConanRequirement(args.name, args.version)}`
  }

  async uninstall(args: NativeRemoveArgs): Promise<string> {
    if (!args.name.trim()) {
      throw new Error('Native dependency name is required')
    }

    if (args.manager === 'vcpkg') {
      await this.removeVcpkgDependency(args.cwd, args.name.trim())
      return `vcpkg manifest updated: removed ${args.name}`
    }

    await this.removeConanRequirement(args.cwd, args.name.trim())
    return `conanfile.txt updated: removed ${args.name}`
  }

  async run(args: NativeRunArgs): Promise<string> {
    const command = splitCommandLine(args.commandLine)
    if (command.length === 0) throw new Error('Native command is required')

    const result = args.tool === 'cmake'
      ? await this.executeCMake(command, args.cwd)
      : args.tool === 'vcpkg'
        ? await this.executeVcpkg(command, args.cwd)
        : await this.executeConan(command, args.cwd)

    return result.stdout || result.stderr
  }

  async configure(cwd: string, buildDir = 'build'): Promise<string> {
    const result = await this.executeCMake(['-S', '.', '-B', buildDir], cwd)
    return result.stdout || result.stderr
  }

  async build(cwd: string, buildDir = 'build'): Promise<string> {
    const result = await this.executeCMake(['--build', buildDir], cwd)
    return result.stdout || result.stderr
  }

  private async readVcpkgManifest(cwd: string): Promise<NativeDependencyInfo[]> {
    try {
      const content = await readFile(join(cwd, 'vcpkg.json'), 'utf-8')
      const parsed = JSON.parse(content)
      const dependencies = Array.isArray(parsed.dependencies) ? parsed.dependencies : []
      return dependencies.map((item: any) => normalizeVcpkgDependency(item)).filter(Boolean) as NativeDependencyInfo[]
    } catch {
      return []
    }
  }

  private async readConanfile(cwd: string): Promise<NativeDependencyInfo[]> {
    const conanPath = await firstExisting([
      join(cwd, 'conanfile.txt'),
      join(cwd, 'conanfile.py')
    ])
    if (!conanPath) return []

    try {
      const content = await readFile(conanPath, 'utf-8')
      return conanPath.endsWith('.py') ? parseConanfilePy(content) : parseConanfileTxt(content)
    } catch {
      return []
    }
  }

  private async readCMakeLinks(cwd: string): Promise<NativeDependencyInfo[]> {
    try {
      const content = await readFile(join(cwd, 'CMakeLists.txt'), 'utf-8')
      return parseCMakeDependencies(content)
    } catch {
      return []
    }
  }

  private async addVcpkgDependency(cwd: string, name: string, version?: string, feature?: string): Promise<void> {
    const manifestPath = join(cwd, 'vcpkg.json')
    const manifest = await readJsonOrDefault(manifestPath, {
      name: safeManifestName(basename(cwd)),
      version: '0.1.0',
      dependencies: []
    })

    const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : []
    const nextDependency = normalizeVcpkgManifestDependency(name, version, feature)

    const nextDependencies = [
      ...dependencies.filter((item: any) => dependencyName(item) !== name),
      nextDependency
    ]

    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, dependencies: nextDependencies }, null, 2)}\n`, 'utf-8')
  }

  private async removeVcpkgDependency(cwd: string, name: string): Promise<void> {
    const manifestPath = join(cwd, 'vcpkg.json')
    const manifest = await readJsonOrDefault(manifestPath, {
      name: safeManifestName(basename(cwd)),
      version: '0.1.0',
      dependencies: []
    })
    const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies : []
    await writeFile(manifestPath, `${JSON.stringify({
      ...manifest,
      dependencies: dependencies.filter((item: any) => dependencyName(item) !== name)
    }, null, 2)}\n`, 'utf-8')
  }

  private async addConanRequirement(cwd: string, name: string, version?: string): Promise<void> {
    const conanPath = join(cwd, 'conanfile.txt')
    const content = await readFileOrDefault(conanPath, '[requires]\n\n[generators]\nCMakeDeps\nCMakeToolchain\n')
    const requirement = formatConanRequirement(name, version)
    const nextContent = upsertConanRequirement(content, requirement)
    await writeFile(conanPath, nextContent, 'utf-8')
  }

  private async removeConanRequirement(cwd: string, name: string): Promise<void> {
    const conanPath = join(cwd, 'conanfile.txt')
    const content = await readFileOrDefault(conanPath, '[requires]\n')
    await writeFile(conanPath, removeConanRequirementLine(content, name), 'utf-8')
  }

  private async executeCMake(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return await runLoggedCommand(await resolveToolBin('cmake', cwd), args, {
      cwd,
      maxBuffer: 1024 * 1024 * 30,
      displayBin: 'cmake'
    })
  }

  private async executeVcpkg(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return await runLoggedCommand(await resolveToolBin('vcpkg', cwd), args, {
      cwd,
      maxBuffer: 1024 * 1024 * 30,
      displayBin: 'vcpkg'
    })
  }

  private async executeConan(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    return await runLoggedCommand(await resolveToolBin('conan', cwd), args, {
      cwd,
      maxBuffer: 1024 * 1024 * 30,
      displayBin: 'conan'
    })
  }
}

const COMMON_NATIVE_PACKAGES: NativeDependencyInfo[] = [
  { name: 'boost', manager: 'vcpkg', source: 'common native package' },
  { name: 'openssl', manager: 'vcpkg', source: 'common native package' },
  { name: 'zlib', manager: 'vcpkg', source: 'common native package' },
  { name: 'curl', manager: 'vcpkg', source: 'common native package' },
  { name: 'fmt', manager: 'vcpkg', source: 'common native package' },
  { name: 'spdlog', manager: 'vcpkg', source: 'common native package' },
  { name: 'protobuf', manager: 'vcpkg', source: 'common native package' },
  { name: 'sqlite3', manager: 'vcpkg', source: 'common native package' }
]

function normalizeVcpkgDependency(item: any): NativeDependencyInfo | null {
  const name = dependencyName(item)
  if (!name) return null
  return {
    name,
    version: typeof item === 'object' ? item.version || item['version>='] : undefined,
    manager: 'vcpkg',
    source: 'vcpkg.json',
    requiredBy: Array.isArray(item?.features) ? item.features.join(', ') : undefined
  }
}

function parseConanfileTxt(content: string): NativeDependencyInfo[] {
  const results: NativeDependencyInfo[] = []
  let inRequires = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    if (/^\[.+]$/.test(line)) {
      inRequires = line.toLowerCase() === '[requires]'
      continue
    }
    if (!inRequires) continue

    const [name, version] = parseConanRequirement(line)
    if (name) {
      results.push({
        name,
        version,
        manager: 'conan',
        source: 'conanfile.txt'
      })
    }
  }

  return results
}

function parseConanfilePy(content: string): NativeDependencyInfo[] {
  const results: NativeDependencyInfo[] = []
  const withoutComments = content.replace(/#[^\r\n]*/g, '')
  const requirementValues = [
    ...withoutComments.matchAll(/\brequires\s*=\s*["']([^"']+)["']/g),
    ...withoutComments.matchAll(/\bself\.requires\s*\(\s*["']([^"']+)["']/g)
  ].map((match) => match[1])

  for (const match of withoutComments.matchAll(/\brequires\s*=\s*\[([\s\S]*?)\]/g)) {
    for (const item of match[1].matchAll(/["']([^"']+)["']/g)) {
      requirementValues.push(item[1])
    }
  }

  for (const requirement of requirementValues) {
    const [name, version] = parseConanRequirement(requirement)
    if (name) {
      results.push({
        name,
        version,
        manager: 'conan',
        source: 'conanfile.py'
      })
    }
  }

  return results
}

function parseCMakeDependencies(content: string): NativeDependencyInfo[] {
  const results: NativeDependencyInfo[] = []
  const withoutComments = content.replace(/#[^\r\n]*/g, '')
  const packageMatches = withoutComments.matchAll(/\bfind_package\s*\(\s*([A-Za-z0-9_.:+-]+)/gi)
  const linkMatches = withoutComments.matchAll(/\btarget_link_libraries\s*\(([\s\S]*?)\)/gi)

  for (const match of packageMatches) {
    const name = match[1]
    if (name) {
      results.push({
        name,
        manager: 'cmake',
        source: 'find_package'
      })
    }
  }

  for (const match of linkMatches) {
    const tokens = match[1]
      .split(/[\s\r\n]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(1)
      .filter((part) => !['PUBLIC', 'PRIVATE', 'INTERFACE', 'debug', 'optimized', 'general'].includes(part))

    for (const token of tokens) {
      const name = token.replace(/^['"]|['"]$/g, '')
      if (!name || /^\$/.test(name)) continue
      results.push({
        name,
        manager: 'cmake',
        source: 'target_link_libraries'
      })
    }
  }

  return results
}

async function scanNativeLibraries(cwd: string): Promise<NativeDependencyInfo[]> {
  const results: NativeDependencyInfo[] = []
  let visited = 0
  const maxVisited = 8000

  async function walk(dir: string): Promise<void> {
    if (visited >= maxVisited) return
    visited++

    const entries = await readDirSafe(dir)
    for (const entry of entries) {
      if (visited >= maxVisited) break
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        const kind = libraryKind(entry.name)
        if (kind) {
          results.push({
            name: basename(entry.name, extname(entry.name)),
            manager: 'library',
            kind,
            linkage: 'dynamic',
            path: relative(cwd, fullPath) || entry.name,
            source: 'project files'
          })
          continue
        }
        if (LIBRARY_SCAN_IGNORES.has(entry.name)) continue
        await walk(fullPath)
        continue
      }

      if (!entry.isFile()) continue
      const kind = libraryKind(entry.name)
      if (!kind) continue

      results.push({
        name: basename(entry.name, extname(entry.name)),
        manager: 'library',
        kind,
        linkage: kind === 'shared' || kind === 'framework' ? 'dynamic' : 'static',
        path: relative(cwd, fullPath) || entry.name,
        source: 'project files'
      })
    }
  }

  await walk(cwd)
  return results
}

function parseVcpkgSearch(output: string): NativeDependencyInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([A-Za-z0-9_.+-]+)\s+([^\s]+)?\s*(.*)$/)
      if (!match) return null
      return {
        name: match[1],
        version: match[2] || '',
        manager: 'vcpkg',
        source: match[3] || 'vcpkg search'
      } as NativeDependencyInfo
    })
    .filter(Boolean) as NativeDependencyInfo[]
}

function parseConanSearch(output: string): NativeDependencyInfo[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z0-9_.+-]+\/[^\s@#]+/.test(line))
    .map((line) => {
      const [name, version] = parseConanRequirement(line)
      return {
        name,
        version,
        manager: 'conan',
        source: 'conan search'
      } as NativeDependencyInfo
    })
    .filter((item) => item.name)
}

function parseConanRequirement(value: string): [string, string] {
  const [name, rest = ''] = value.split('/')
  const version = rest.split('@')[0]
  return [name.trim(), version.trim()]
}

function formatConanRequirement(name: string, version?: string): string {
  const normalized = name.trim()
  if (!version || normalized.includes('/')) return normalized
  return `${normalized}/${version.trim()}`
}

function upsertConanRequirement(content: string, requirement: string): string {
  const [name] = parseConanRequirement(requirement)
  const withoutExisting = removeConanRequirementLine(content, name)
  const lines = withoutExisting.split(/\r?\n/)
  const requiresIndex = lines.findIndex((line) => line.trim().toLowerCase() === '[requires]')

  if (requiresIndex >= 0) {
    lines.splice(requiresIndex + 1, 0, requirement)
    return `${lines.join('\n').trimEnd()}\n`
  }

  return `[requires]\n${requirement}\n\n${withoutExisting.trimEnd()}\n`
}

function removeConanRequirementLine(content: string, name: string): string {
  let inRequires = false
  return `${content
    .split(/\r?\n/)
    .filter((rawLine) => {
      const line = rawLine.trim()
      if (/^\[.+]$/.test(line)) {
        inRequires = line.toLowerCase() === '[requires]'
        return true
      }
      if (!inRequires || !line || line.startsWith('#')) return true
      return parseConanRequirement(line)[0] !== name
    })
    .join('\n')
    .trimEnd()}\n`
}

async function readJsonOrDefault(path: string, fallback: any): Promise<any> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return fallback
  }
}

async function readFileOrDefault(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return fallback
  }
}

async function firstExisting(paths: string[]): Promise<string> {
  for (const path of paths) {
    if (await fileExists(path)) return path
  }
  return ''
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readDirSafe(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function libraryKind(fileName: string): NativeLibraryKind | null {
  const lower = fileName.toLowerCase()
  const extension = extname(lower)
  if (lower.endsWith('.framework')) return 'framework'
  if (SHARED_LIBRARY_EXTENSIONS.has(extension)) return 'shared'
  if (STATIC_LIBRARY_EXTENSIONS.has(extension)) return 'static'
  if (IMPORT_LIBRARY_EXTENSIONS.has(extension)) return 'import'
  return null
}

function dependencyName(item: any): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') return item.name || ''
  return ''
}

function normalizeVcpkgManifestDependency(name: string, version?: string, feature?: string): string | Record<string, any> {
  const normalizedVersion = version?.trim()
  const normalizedFeature = feature?.trim()
  if (!normalizedVersion && !normalizedFeature) return name

  return {
    name,
    ...(normalizedVersion ? { 'version>=': normalizedVersion } : {}),
    ...(normalizedFeature ? { features: [normalizedFeature] } : {})
  }
}

function safeManifestName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'native-project'
}

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .match(/"([^"]*)"|'([^']*)'|\S+/g)
    ?.map((part) => part.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean) || []
}

function uniqueNativeDependencies(items: NativeDependencyInfo[]): NativeDependencyInfo[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.manager}:${item.name}:${item.path || ''}`.toLowerCase()
    if (!item.name || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
