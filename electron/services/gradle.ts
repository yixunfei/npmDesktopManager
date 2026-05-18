import { access, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'
import type { MavenSearchMode, MavenSearchOptions } from './maven'

export interface GradleDependency {
  groupId: string
  artifactId: string
  version: string
  configuration: string
}

export interface GradleSearchResult extends GradleDependency {
  latestVersion?: string
  description?: string
  repository?: string
}

export interface GradleAddDependencyArgs extends GradleDependency {
  cwd: string
}

export interface GradleRemoveDependencyArgs {
  cwd: string
  groupId: string
  artifactId: string
  configuration?: string
}

const GRADLE_DEPENDENCY_PACKAGINGS = new Set(['jar', 'aar', 'war', 'ear', 'pom', 'bundle'])
export type GradleSearchOptions = MavenSearchOptions

export class GradleService {
  private async executeGradle(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      const bin = cwd ? await resolveGradleBin(cwd) : await resolveToolBin('gradle', cwd)
      return await runLoggedCommand(bin, args, {
        cwd,
        maxBuffer: 1024 * 1024 * 30,
        displayBin: 'gradle'
      })
    } catch (error: any) {
      const wrapped = new Error(error.message || 'gradle command failed') as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      throw wrapped
    }
  }

  async detect(cwd: string): Promise<{ hasGradleBuild: boolean; path: string }> {
    const buildPath = await findBuildFile(cwd)
    return { hasGradleBuild: Boolean(buildPath), path: buildPath || join(cwd, 'build.gradle') }
  }

  async list(cwd: string): Promise<GradleDependency[]> {
    const buildPath = await findBuildFile(cwd)
    if (!buildPath) return []
    const content = await readFile(buildPath, 'utf-8')
    return parseGradleDependencies(content)
  }

  async search(query: string, options?: GradleSearchOptions): Promise<GradleSearchResult[]> {
    const normalized = query.trim()
    if (!normalized) return []
    const searchOptions = normalizeMavenSearchOptions(options)
    try {
      const results = searchOptions.source === 'nexus'
        ? await searchNexusRepository(normalized, searchOptions)
        : await searchMavenCentral(normalized, searchOptions)
      return rankGradleResults(results, normalized, searchOptions).slice(0, searchOptions.limit)
    } catch {
      return []
    }
  }

  async versions(groupId: string, artifactId: string): Promise<string[]> {
    if (!groupId.trim() || !artifactId.trim()) return []
    try {
      const query = `g:"${groupId.trim()}" AND a:"${artifactId.trim()}"`
      const data = JSON.parse(await httpsGet(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&core=gav&rows=30&wt=json`))
      return (data.response?.docs || [])
        .map((doc: any) => doc.v)
        .filter(Boolean)
        .slice(0, 30)
    } catch {
      return []
    }
  }

  async addDependency(args: GradleAddDependencyArgs): Promise<void> {
    if (!args.groupId || !args.artifactId || !args.version) {
      throw new Error('groupId, artifactId and version are required')
    }

    const buildPath = await ensureBuildFile(args.cwd)
    const content = await readFile(buildPath, 'utf-8')
    const configuration = args.configuration || 'implementation'
    const coordinate = `${args.groupId}:${args.artifactId}:${args.version}`
    const line = buildPath.endsWith('.kts')
      ? `    ${configuration}("${coordinate}")`
      : `    ${configuration} '${coordinate}'`

    const nextContent = upsertGradleDependency(content, line, args)
    await writeFile(buildPath, nextContent, 'utf-8')
  }

  async updateDependency(args: GradleAddDependencyArgs): Promise<void> {
    await this.addDependency(args)
  }

  async removeDependency(args: GradleRemoveDependencyArgs): Promise<void> {
    if (!args.groupId || !args.artifactId) {
      throw new Error('groupId and artifactId are required')
    }

    const buildPath = await findBuildFile(args.cwd)
    if (!buildPath) {
      throw new Error('Gradle build file is not available')
    }

    const content = await readFile(buildPath, 'utf-8')
    await writeFile(buildPath, removeGradleDependency(content, args), 'utf-8')
  }

  async runTask(cwd: string, taskLine: string): Promise<string> {
    const args = splitCommandLine(taskLine)
    if (args.length === 0) throw new Error('Gradle task is required')
    const { stdout, stderr } = await this.executeGradle(args, cwd)
    return stdout || stderr
  }

  async tasks(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeGradle(['tasks', '--all'], cwd)
    return stdout || stderr
  }

  async dependencyTree(cwd: string, configuration = 'runtimeClasspath'): Promise<string> {
    const { stdout, stderr } = await this.executeGradle(['dependencies', '--configuration', configuration], cwd)
    return stdout || stderr
  }

  async dependencyInsight(cwd: string, dependency: string, configuration = 'runtimeClasspath'): Promise<string> {
    const { stdout, stderr } = await this.executeGradle(['dependencyInsight', '--dependency', dependency, '--configuration', configuration], cwd)
    return stdout || stderr
  }
}

async function resolveGradleBin(cwd: string): Promise<string> {
  const wrapperName = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
  const wrapperPath = join(cwd, wrapperName)
  try {
    await access(wrapperPath)
    return wrapperPath
  } catch {
    return await resolveToolBin('gradle', cwd)
  }
}

async function findBuildFile(cwd: string): Promise<string> {
  const candidates = ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle']
  for (const candidate of candidates) {
    const filePath = join(cwd, candidate)
    try {
      await access(filePath)
      return filePath
    } catch {
    }
  }
  return ''
}

async function ensureBuildFile(cwd: string): Promise<string> {
  const existing = await findBuildFile(cwd)
  if (existing && !existing.includes('settings.gradle')) return existing
  const target = join(cwd, 'build.gradle')
  try {
    await access(target)
  } catch {
    await writeFile(target, 'plugins {\n}\n\ndependencies {\n}\n', 'utf-8')
  }
  return target
}

function parseGradleDependencies(content: string): GradleDependency[] {
  const dependencies: GradleDependency[] = []
  const seen = new Set<string>()

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/, '').trim()
    if (!line || line.startsWith('*')) continue

    const stringNotation = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*(?:\(|\s)\s*['"]([^:'"]+):([^:'"]+):([^'"]+)['"]\)?/)
    if (stringNotation) {
      pushUnique(dependencies, seen, {
        configuration: stringNotation[1],
        groupId: stringNotation[2],
        artifactId: stringNotation[3],
        version: cleanGradleVersion(stringNotation[4])
      })
      continue
    }

    const mapNotation = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s+group:\s*['"]([^'"]+)['"],\s*name:\s*['"]([^'"]+)['"],\s*version:\s*['"]([^'"]+)['"]/)
    if (mapNotation) {
      pushUnique(dependencies, seen, {
        configuration: mapNotation[1],
        groupId: mapNotation[2],
        artifactId: mapNotation[3],
        version: cleanGradleVersion(mapNotation[4])
      })
    }
  }

  return dependencies
}

function pushUnique(items: GradleDependency[], seen: Set<string>, dependency: GradleDependency): void {
  const key = `${dependency.configuration}:${dependency.groupId}:${dependency.artifactId}`
  if (seen.has(key)) return
  seen.add(key)
  items.push(dependency)
}

function cleanGradleVersion(value: string): string {
  return value.replace(/\)\s*$/, '').trim()
}

function upsertGradleDependency(content: string, line: string, dep: Pick<GradleDependency, 'groupId' | 'artifactId'>): string {
  const withoutExisting = removeGradleDependency(content, dep)

  if (withoutExisting.includes('dependencies {')) {
    return withoutExisting.replace(/dependencies\s*\{/, (match) => `${match}\n${line}`)
  }

  return `${withoutExisting.trimEnd()}\n\ndependencies {\n${line}\n}\n`
}

function removeGradleDependency(content: string, dep: Pick<GradleDependency, 'groupId' | 'artifactId'> & { configuration?: string }): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      if (dep.configuration && !line.trim().startsWith(dep.configuration)) return true
      return !line.includes(`${dep.groupId}:${dep.artifactId}:`)
        && !(line.includes(`group: '${dep.groupId}'`) && line.includes(`name: '${dep.artifactId}'`))
        && !(line.includes(`group: "${dep.groupId}"`) && line.includes(`name: "${dep.artifactId}"`))
    })
    .join('\n')
}

async function httpsGet(url: string): Promise<string> {
  const https = await import('https')
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'npmDesktopManager/1.0'
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

const DEFAULT_GRADLE_SEARCH_OPTIONS: Required<Omit<GradleSearchOptions, 'customUrl'>> & { customUrl: string } = {
  mode: 'startsWith',
  scope: 'artifactId',
  source: 'mavenCentral',
  customUrl: '',
  includeLocal: false,
  limit: 30
}

function normalizeMavenSearchOptions(options?: GradleSearchOptions): Required<Omit<GradleSearchOptions, 'customUrl'>> & { customUrl: string } {
  return {
    ...DEFAULT_GRADLE_SEARCH_OPTIONS,
    ...options,
    customUrl: options?.customUrl?.trim() || '',
    limit: Math.min(Math.max(options?.limit || DEFAULT_GRADLE_SEARCH_OPTIONS.limit, 1), 100)
  }
}

async function searchMavenCentral(query: string, options: Required<Omit<GradleSearchOptions, 'customUrl'>> & { customUrl: string }): Promise<GradleSearchResult[]> {
  const batches: GradleSearchResult[][] = []
  for (const searchQuery of buildMavenCentralQueries(query, options)) {
    const data = JSON.parse(await httpsGet(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(searchQuery)}&rows=${Math.min(options.limit * 3, 100)}&wt=json`))
    const docs = data.response?.docs || []
    batches.push(docs
      .filter(isGradleDependencyDoc)
      .map((doc: any) => ({
        groupId: doc.g,
        artifactId: doc.a,
        version: doc.latestVersion || '',
        latestVersion: doc.latestVersion || '',
        configuration: 'implementation',
        description: 'Maven Central dependency',
        repository: 'Maven Central'
      }))
      .filter((item: GradleSearchResult) => item.groupId && item.artifactId))
  }
  return uniqueGradleResults(batches.flat())
}

async function searchNexusRepository(query: string, options: Required<Omit<GradleSearchOptions, 'customUrl'>> & { customUrl: string }): Promise<GradleSearchResult[]> {
  if (!options.customUrl) return []
  const baseUrl = options.customUrl.replace(/\/+$/, '')
  const url = new URL(`${baseUrl}/service/rest/v1/search`)
  url.searchParams.set('format', 'maven2')
  url.searchParams.set('sort', 'version')
  url.searchParams.set('direction', 'desc')
  for (const [key, value] of nexusSearchParams(query, options)) {
    url.searchParams.set(key, value)
  }
  const data = JSON.parse(await httpsGet(url.toString()))
  const items = Array.isArray(data.items) ? data.items : []
  return uniqueGradleResults(items
    .map((item: any) => nexusItemToGradleResult(item, options.customUrl))
    .filter((item: GradleSearchResult | null): item is GradleSearchResult => Boolean(item))
    .filter(isGradleDependencyResult))
}

function buildMavenCentralQueries(query: string, options: GradleSearchOptions): string[] {
  const parsed = parseMavenQuery(query)
  const mode = options.mode || DEFAULT_GRADLE_SEARCH_OPTIONS.mode
  const scope = parsed.artifactId ? 'coordinate' : options.scope || DEFAULT_GRADLE_SEARCH_OPTIONS.scope
  const fallback = `${escapeSolrValue(query)} AND -p:"maven-plugin"`

  if (scope === 'coordinate') {
    if (parsed.groupId && parsed.artifactId) {
      return [`g:"${escapeSolrPhrase(parsed.groupId)}" AND ${fieldQuery('a', parsed.artifactId, mode)} AND -p:"maven-plugin"`]
    }
    if (parsed.groupId) return [`g:${solrPattern(parsed.groupId, mode)} AND -p:"maven-plugin"`]
  }
  if (scope === 'groupId') return [`${fieldQuery('g', query, mode)} AND -p:"maven-plugin"`]
  if (scope === 'artifactId') return [`${fieldQuery('a', query, mode)} AND -p:"maven-plugin"`]
  if (scope === 'all') {
    return [
      `${fieldQuery('a', query, mode)} AND -p:"maven-plugin"`,
      `${fieldQuery('g', query, mode)} AND -p:"maven-plugin"`,
      fallback
    ]
  }
  return [fallback]
}

function nexusSearchParams(query: string, options: GradleSearchOptions): Array<[string, string]> {
  const parsed = parseMavenQuery(query)
  const mode = options.mode || DEFAULT_GRADLE_SEARCH_OPTIONS.mode
  const scope = parsed.artifactId ? 'coordinate' : options.scope || DEFAULT_GRADLE_SEARCH_OPTIONS.scope
  const artifactQuery = parsed.artifactId || query

  if (scope === 'coordinate') {
    return [
      ...(parsed.groupId ? [['maven.groupId', parsed.groupId] as [string, string]] : []),
      ...(artifactQuery ? [['maven.artifactId', nexusPattern(artifactQuery, mode)] as [string, string]] : [])
    ]
  }
  if (scope === 'groupId') return [['maven.groupId', nexusPattern(query, mode)]]
  if (scope === 'artifactId') return [['maven.artifactId', nexusPattern(query, mode)]]
  return [['q', query]]
}

function fieldQuery(field: 'g' | 'a', query: string, mode: MavenSearchMode): string {
  if (mode === 'keyword') return escapeSolrValue(query)
  if (mode === 'exact') return `${field}:"${escapeSolrPhrase(query)}"`
  return `${field}:${solrPattern(query, mode)}`
}

function solrPattern(query: string, mode: MavenSearchMode): string {
  const value = escapeSolrPattern(query)
  if (mode === 'contains') return `${value}*`
  if (mode === 'startsWith') return `${value}*`
  if (mode === 'exact') return `"${escapeSolrPhrase(query)}"`
  return escapeSolrValue(query)
}

function nexusPattern(query: string, mode: MavenSearchMode): string {
  if (mode === 'contains') return `*${query}*`
  if (mode === 'startsWith') return `${query}*`
  return query
}

function parseMavenQuery(query: string): { groupId: string; artifactId: string } {
  const parts = query.split(':').map((part) => part.trim()).filter(Boolean)
  return { groupId: parts[0] || '', artifactId: parts[1] || '' }
}

function escapeSolrPattern(value: string): string {
  return value.trim().replace(/([+\-&|!(){}\[\]^"~?:\\/])/g, '\\$1').replace(/\s+/g, '\\ ')
}

function escapeSolrPhrase(value: string): string {
  return value.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function escapeSolrValue(value: string): string {
  return value.trim().split(/\s+/).map(escapeSolrPattern).filter(Boolean).join(' ')
}

function nexusItemToGradleResult(item: any, repository: string): GradleSearchResult | null {
  const coordinates = item?.maven2 || {}
  const groupId = coordinates.groupId || item.group || ''
  const artifactId = coordinates.artifactId || item.name || ''
  if (!groupId || !artifactId) return null
  return {
    groupId,
    artifactId,
    version: item.version || coordinates.version || '',
    latestVersion: item.version || coordinates.version || '',
    configuration: 'implementation',
    description: `Nexus dependency (${item.repository || repository})`,
    repository: item.repository || repository
  }
}

function isGradleDependencyResult(item: GradleSearchResult): boolean {
  return isGradleDependencyDoc({ g: item.groupId, a: item.artifactId, p: (item as any).type || 'jar' })
}

function rankGradleResults(items: GradleSearchResult[], query: string, options: GradleSearchOptions): GradleSearchResult[] {
  const normalized = query.toLowerCase()
  const mode = options.mode || DEFAULT_GRADLE_SEARCH_OPTIONS.mode
  return uniqueGradleResults(items).sort((a, b) => {
    const aScore = gradleResultScore(a, normalized, mode)
    const bScore = gradleResultScore(b, normalized, mode)
    if (aScore !== bScore) return bScore - aScore
    return `${a.groupId}:${a.artifactId}`.localeCompare(`${b.groupId}:${b.artifactId}`)
  })
}

function gradleResultScore(item: GradleSearchResult, query: string, mode: MavenSearchMode): number {
  const artifact = item.artifactId.toLowerCase()
  const group = item.groupId.toLowerCase()
  let score = 0
  if (artifact === query) score += 100
  if (artifact.startsWith(query)) score += 80
  if (artifact.includes(query)) score += 50
  if (group.includes(query)) score += 10
  if (item.repository === 'Maven Central') score += 4
  if (mode === 'startsWith' && artifact.startsWith(query)) score += 8
  return score
}

function uniqueGradleResults(items: GradleSearchResult[]): GradleSearchResult[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.groupId}:${item.artifactId}`.toLowerCase()
    if (!item.groupId || !item.artifactId || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function isGradleDependencyDoc(doc: any): boolean {
  if (!doc?.g || !doc?.a) return false
  if (doc.p === 'maven-plugin') return false
  if (typeof doc.a === 'string' && doc.a.endsWith('-maven-plugin')) return false
  if (doc.p && !GRADLE_DEPENDENCY_PACKAGINGS.has(doc.p)) return false
  return true
}
