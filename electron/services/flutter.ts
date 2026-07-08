import { access, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export type FlutterDependencyType = 'dependencies' | 'dev_dependencies' | 'dependency_overrides'
export type FlutterDependencySource = 'hosted' | 'sdk' | 'path' | 'git'

export interface FlutterDependency {
  name: string
  version: string
  type: FlutterDependencyType
  source?: FlutterDependencySource
  sdk?: string
  path?: string
  git?: string
}

export interface FlutterAsset {
  path: string
  kind: 'file' | 'directory' | 'unknown'
}

export interface FlutterDependencyTreeNode {
  name: string
  version?: string
  type?: string
  source?: string
  dependencies: FlutterDependencyTreeNode[]
}

export interface FlutterPubspecInfo {
  hasPubspec: boolean
  path: string
  name: string
  version: string
  description: string
  publishTo?: string
  environmentSdk?: string
  dependencies: FlutterDependency[]
  assets: FlutterAsset[]
}

export interface FlutterSearchResult {
  name: string
  version?: string
  description?: string
  popularity?: number
  likes?: number
  pubPoints?: number
}

export interface FlutterDependencyArgs {
  cwd: string
  packageName: string
  version?: string
  type?: FlutterDependencyType
  source?: FlutterDependencySource
  sdk?: string
  path?: string
  git?: string
}

export interface FlutterPublishArgs {
  cwd: string
  dryRun?: boolean
  force?: boolean
  server?: string
}

export interface FlutterPublishCheckResult {
  canPublish: boolean
  errors: string[]
  warnings: string[]
  packageInfo: FlutterPubspecInfo | null
}

export interface FlutterSecurityIssue {
  packageName: string
  version: string
  dependencyType?: string
  source?: string
  id: string
  summary: string
  details?: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'unknown'
  aliases: string[]
  published?: string
  modified?: string
  affectedRange?: string
  fixedVersion?: string
  references: Array<{ type?: string; url: string }>
  url: string
}

export interface FlutterSecurityAuditResult {
  scannedAt: string
  source: 'pubspec.lock' | 'pubspec.yaml'
  dependencyCount: number
  vulnerableCount: number
  skipped: string[]
  issues: FlutterSecurityIssue[]
  error?: string
}

const PUBSPEC_FILE = 'pubspec.yaml'
const DEPENDENCY_SECTIONS: FlutterDependencyType[] = ['dependencies', 'dev_dependencies', 'dependency_overrides']

export class FlutterService {
  private async executeFlutter(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await runLoggedCommand(await resolveToolBin('flutter', cwd), args, {
        cwd,
        maxBuffer: 1024 * 1024 * 30,
        displayBin: 'flutter'
      })
    } catch (error: any) {
      const wrapped = new Error(error.message || 'flutter command failed') as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      throw wrapped
    }
  }

  private async executePub(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    return await this.executeFlutter(['pub', ...args], cwd)
  }

  async detect(cwd: string): Promise<{ hasPubspec: boolean; path: string }> {
    const pubspecPath = join(cwd, PUBSPEC_FILE)
    try {
      await access(pubspecPath)
      return { hasPubspec: true, path: pubspecPath }
    } catch {
      return { hasPubspec: false, path: pubspecPath }
    }
  }

  async read(cwd: string): Promise<FlutterPubspecInfo> {
    const pubspecPath = join(cwd, PUBSPEC_FILE)
    const content = await readFile(pubspecPath, 'utf-8')
    return parsePubspec(content, pubspecPath)
  }

  async list(cwd: string): Promise<FlutterDependency[]> {
    return (await this.read(cwd)).dependencies
  }

  async assets(cwd: string): Promise<FlutterAsset[]> {
    return (await this.read(cwd)).assets
  }

  async search(query: string): Promise<FlutterSearchResult[]> {
    const normalized = query.trim()
    if (!normalized) return []

    try {
      const data = JSON.parse(await httpsGet(`https://pub.dev/api/search?q=${encodeURIComponent(normalized)}`))
      const names = (Array.isArray(data.packages) ? data.packages : [])
        .map((item: any) => item.package || item.name)
        .filter(Boolean)
        .slice(0, 20)

      const details = await Promise.all(names.map((name: string) => this.packageInfo(name)))
      return details.filter(Boolean) as FlutterSearchResult[]
    } catch {
      return []
    }
  }

  async versions(packageName: string): Promise<string[]> {
    const normalized = packageName.trim()
    if (!normalized) return []

    try {
      const data = JSON.parse(await httpsGet(`https://pub.dev/api/packages/${encodeURIComponent(normalized)}`))
      const versions = Array.isArray(data.versions) ? data.versions : []
      return versions
        .map((item: any) => item.version)
        .filter(Boolean)
        .reverse()
        .slice(0, 50)
    } catch {
      return []
    }
  }

  async addDependency(args: FlutterDependencyArgs): Promise<string> {
    validateDependencyArgs(args)
    const pubspecPath = join(args.cwd, PUBSPEC_FILE)
    const content = await readFile(pubspecPath, 'utf-8')
    const type = args.type || 'dependencies'
    const version = await this.resolveDependencyVersion(args)
    const nextContent = upsertDependency(content, {
      ...args,
      version,
      type,
      source: args.source || inferDependencySource(args)
    })
    await writeFile(pubspecPath, nextContent, 'utf-8')
    const { stdout, stderr } = await this.executePub(['get'], args.cwd)
    return stdout || stderr
  }

  async update(args: { cwd: string; packageName?: string; type?: FlutterDependencyType }): Promise<string> {
    if (!args.packageName) {
      const { stdout, stderr } = await this.executePub(['upgrade', '--major-versions'], args.cwd)
      return stdout || stderr
    }

    const pubspec = await this.read(args.cwd)
    const current = pubspec.dependencies.find((item) => item.name === args.packageName && (!args.type || item.type === args.type))
    const versions = await this.versions(args.packageName)
    const targetVersion = versions[0] || current?.version || 'any'
    return await this.addDependency({
      cwd: args.cwd,
      packageName: args.packageName,
      type: args.type || current?.type || 'dependencies',
      version: targetVersion,
      source: current?.source || 'hosted',
      sdk: current?.sdk,
      path: current?.path,
      git: current?.git
    })
  }

  async removeDependency(args: { cwd: string; packageName: string; type?: FlutterDependencyType }): Promise<string> {
    const pubspecPath = join(args.cwd, PUBSPEC_FILE)
    const content = await readFile(pubspecPath, 'utf-8')
    const nextContent = removeDependency(content, args.packageName, args.type)
    await writeFile(pubspecPath, nextContent, 'utf-8')
    const { stdout, stderr } = await this.executePub(['get'], args.cwd)
    return stdout || stderr
  }

  async outdated(cwd: string): Promise<any> {
    try {
      const { stdout } = await this.executePub(['outdated', '--json'], cwd)
      return parseJson(stdout, { packages: [] })
    } catch (error: any) {
      if (error.stdout) return parseJson(error.stdout, { packages: [] })
      return { packages: [], error: error.stderr || error.message || 'flutter pub outdated failed' }
    }
  }

  async deps(cwd: string): Promise<string> {
    try {
      const { stdout, stderr } = await this.executePub(['deps', '--json'], cwd)
      return stdout || stderr
    } catch {
      const { stdout, stderr } = await this.executePub(['deps'], cwd)
      return stdout || stderr
    }
  }

  async dependencyTree(cwd: string): Promise<FlutterDependencyTreeNode> {
    try {
      const { stdout } = await this.executePub(['deps', '--json'], cwd)
      const parsed = parseJson<any>(stdout, null)
      const tree = buildDependencyTreeFromPubDeps(parsed)
      if (tree) return tree
    } catch {
    }

    return await this.fallbackDependencyTree(cwd)
  }

  async get(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executePub(['get'], cwd)
    return stdout || stderr
  }

  async run(cwd: string, commandLine: string): Promise<string> {
    const args = splitCommandLine(commandLine)
    if (args.length === 0) throw new Error('Flutter command is required')
    const { stdout, stderr } = await this.executeFlutter(args, cwd)
    return stdout || stderr
  }

  async addAsset(args: { cwd: string; path: string }): Promise<void> {
    const normalized = normalizeAssetPath(args.path)
    if (!normalized) throw new Error('Asset path is required')
    const pubspecPath = join(args.cwd, PUBSPEC_FILE)
    const content = await readFile(pubspecPath, 'utf-8')
    await writeFile(pubspecPath, upsertAsset(content, normalized), 'utf-8')
  }

  async removeAsset(args: { cwd: string; path: string }): Promise<void> {
    const normalized = normalizeAssetPath(args.path)
    if (!normalized) throw new Error('Asset path is required')
    const pubspecPath = join(args.cwd, PUBSPEC_FILE)
    const content = await readFile(pubspecPath, 'utf-8')
    await writeFile(pubspecPath, removeAsset(content, normalized), 'utf-8')
  }

  async checkPublish(cwd: string): Promise<FlutterPublishCheckResult> {
    const result: FlutterPublishCheckResult = {
      canPublish: true,
      errors: [],
      warnings: [],
      packageInfo: null
    }

    try {
      const info = await this.read(cwd)
      result.packageInfo = info

      if (!info.name) result.errors.push('pubspec.yaml is missing name.')
      if (!info.version) result.errors.push('pubspec.yaml is missing version.')
      if (!info.description) result.warnings.push('Add a description to improve pub.dev discovery.')
      if (!info.environmentSdk) result.warnings.push('Add environment.sdk constraints.')
      if (info.publishTo === 'none') result.warnings.push('publish_to is set to none; this project is marked private.')

      for (const fileName of ['README.md', 'CHANGELOG.md', 'LICENSE']) {
        try {
          await access(join(cwd, fileName))
        } catch {
          result.warnings.push(`${fileName} is missing.`)
        }
      }
    } catch (error: any) {
      result.errors.push(error.message || 'Unable to read pubspec.yaml.')
    }

    result.canPublish = result.errors.length === 0
    return result
  }

  async publish(args: FlutterPublishArgs): Promise<string> {
    const command = ['publish']
    if (args.dryRun !== false) command.push('--dry-run')
    if (args.force) command.push('--force')
    if (args.server) command.push('--server', args.server)
    const { stdout, stderr } = await this.executePub(command, args.cwd)
    return stdout || stderr
  }

  async securityAudit(cwd: string): Promise<FlutterSecurityAuditResult> {
    const lockedPackages = await readLockedPackages(cwd)
    const source: FlutterSecurityAuditResult['source'] = lockedPackages.length > 0 ? 'pubspec.lock' : 'pubspec.yaml'
    const candidates = lockedPackages.length > 0
      ? lockedPackages
      : (await this.read(cwd)).dependencies
        .filter((item) => item.source === 'hosted' || !item.source)
        .map((item) => ({
          name: item.name,
          version: exactVersionOrEmpty(item.version),
          dependencyType: item.type,
          source: item.source || 'hosted'
        }))

    const scannable = candidates.filter((item) => item.name && item.version)
    const skipped = candidates
      .filter((item) => !item.version)
      .map((item) => item.name)

    const result: FlutterSecurityAuditResult = {
      scannedAt: new Date().toISOString(),
      source,
      dependencyCount: candidates.length,
      vulnerableCount: 0,
      skipped,
      issues: []
    }

    if (scannable.length === 0) {
      result.error = source === 'pubspec.lock'
        ? 'No locked hosted packages were found.'
        : 'No exact dependency versions were available. Run flutter pub get to generate pubspec.lock for precise auditing.'
      return result
    }

    const queries = scannable.map((item) => ({
      version: item.version,
      package: {
        name: item.name,
        ecosystem: 'Pub'
      }
    }))

    const batch = JSON.parse(await httpsPostJson('https://api.osv.dev/v1/querybatch', { queries }))
    const results = Array.isArray(batch.results) ? batch.results : []
    const issueEntries: Array<{ dependency: typeof scannable[number]; vulnId: string }> = []

    results.forEach((item: any, index: number) => {
      const vulns = Array.isArray(item?.vulns) ? item.vulns : []
      for (const vuln of vulns) {
        if (vuln?.id) {
          issueEntries.push({ dependency: scannable[index], vulnId: vuln.id })
        }
      }
    })

    const details = await Promise.all(issueEntries.map(async (entry) => {
      try {
        const vuln = JSON.parse(await httpsGet(`https://api.osv.dev/v1/vulns/${encodeURIComponent(entry.vulnId)}`))
        return buildSecurityIssue(entry.dependency, vuln)
      } catch {
        return {
          packageName: entry.dependency.name,
          version: entry.dependency.version,
          dependencyType: entry.dependency.dependencyType,
          source: entry.dependency.source,
          id: entry.vulnId,
          summary: entry.vulnId,
          severity: 'unknown',
          aliases: [],
          references: [],
          url: `https://osv.dev/vulnerability/${encodeURIComponent(entry.vulnId)}`
        } as FlutterSecurityIssue
      }
    }))

    result.issues = uniqueSecurityIssues(details)
    result.vulnerableCount = new Set(result.issues.map((issue) => issue.packageName)).size
    return result
  }

  private async packageInfo(packageName: string): Promise<FlutterSearchResult | null> {
    try {
      const data = JSON.parse(await httpsGet(`https://pub.dev/api/packages/${encodeURIComponent(packageName)}`))
      return {
        name: data.name || packageName,
        version: data.latest?.version || '',
        description: data.latest?.pubspec?.description || '',
        popularity: numberOrUndefined(data.popularityScore),
        likes: numberOrUndefined(data.likeCount),
        pubPoints: numberOrUndefined(data.grantedPoints)
      }
    } catch {
      return { name: packageName }
    }
  }

  private async resolveDependencyVersion(args: FlutterDependencyArgs): Promise<string> {
    if (args.source && args.source !== 'hosted') return args.version || ''
    if (args.version?.trim()) return args.version.trim()
    const versions = await this.versions(args.packageName)
    return versions[0] || 'any'
  }

  private async fallbackDependencyTree(cwd: string): Promise<FlutterDependencyTreeNode> {
    const info = await this.read(cwd)
    const locked = await readLockedPackages(cwd)
    const lockedMap = new Map(locked.map((item) => [item.name, item]))
    return {
      name: info.name || 'flutter-project',
      version: info.version,
      source: 'root',
      dependencies: info.dependencies
        .filter((item) => item.type !== 'dependency_overrides')
        .map((item) => ({
          name: item.name,
          version: lockedMap.get(item.name)?.version || item.version,
          type: item.type,
          source: lockedMap.get(item.name)?.source || item.source,
          dependencies: []
        }))
    }
  }
}

function parsePubspec(content: string, pubspecPath: string): FlutterPubspecInfo {
  return {
    hasPubspec: true,
    path: pubspecPath,
    name: readTopLevelValue(content, 'name'),
    version: readTopLevelValue(content, 'version'),
    description: readTopLevelValue(content, 'description'),
    publishTo: readTopLevelValue(content, 'publish_to'),
    environmentSdk: readNestedValue(content, 'environment', 'sdk'),
    dependencies: parseDependencies(content),
    assets: parseAssets(content)
  }
}

function parseDependencies(content: string): FlutterDependency[] {
  return DEPENDENCY_SECTIONS.flatMap((section) => parseDependencySection(content, section))
}

function parseDependencySection(content: string, section: FlutterDependencyType): FlutterDependency[] {
  const range = sectionRange(content, section)
  if (!range) return []
  const dependencies: FlutterDependency[] = []
  const lines = content.split(/\r?\n/)

  for (let index = range.start + 1; index < range.end; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.replace(/\s+#.*$/, '')
    const match = line.match(/^(\s{2,})([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (!match || match[1].length !== 2) continue

    const name = match[2]
    const inlineValue = stripYamlValue(match[3])
    const nestedLines: string[] = []
    let cursor = index + 1
    while (cursor < range.end && lineIndent(lines[cursor]) > 2) {
      nestedLines.push(lines[cursor])
      cursor += 1
    }

    const nested = nestedLines.join('\n')
    dependencies.push({
      name,
      version: resolveDependencyDisplayVersion(inlineValue, nested),
      type: section,
      source: resolveDependencySource(inlineValue, nested),
      sdk: readBlockValue(nested, 'sdk'),
      path: readInlineObjectValue(inlineValue, 'path') || readBlockValue(nested, 'path'),
      git: readInlineObjectValue(inlineValue, 'git') || readBlockValue(nested, 'git') || readBlockValue(nested, 'url')
    })
  }

  return dependencies
}

function parseAssets(content: string): FlutterAsset[] {
  const range = sectionRange(content, 'flutter')
  if (!range) return []
  const lines = content.split(/\r?\n/)
  const assets: FlutterAsset[] = []
  let inAssets = false

  for (let index = range.start + 1; index < range.end; index += 1) {
    const rawLine = lines[index]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = lineIndent(rawLine)
    if (indent === 2 && /^assets\s*:/.test(trimmed)) {
      inAssets = true
      continue
    }
    if (inAssets && indent <= 2 && !trimmed.startsWith('-')) {
      inAssets = false
    }
    if (!inAssets) continue

    const match = trimmed.match(/^-\s+(.+)$/)
    if (!match) continue
    const assetPath = stripYamlValue(match[1])
    if (!assetPath) continue
    assets.push({
      path: assetPath,
      kind: assetPath.endsWith('/') ? 'directory' : 'file'
    })
  }

  return assets
}

function buildDependencyTreeFromPubDeps(data: any): FlutterDependencyTreeNode | null {
  const packages = Array.isArray(data?.packages) ? data.packages : []
  if (packages.length === 0) return null

  const packageMap = new Map<string, any>()
  for (const item of packages) {
    if (item?.name) packageMap.set(item.name, item)
  }

  const root = packages.find((item: any) => item.kind === 'root') || packages[0]
  if (!root?.name) return null

  const buildNode = (name: string, path: string[] = []): FlutterDependencyTreeNode => {
    const item = packageMap.get(name)
    if (!item) {
      return { name, dependencies: [] }
    }

    if (path.includes(name)) {
      return {
        name,
        version: item.version,
        type: item.kind,
        source: item.source,
        dependencies: []
      }
    }

    const dependencies = Array.isArray(item.dependencies) ? item.dependencies : []
    return {
      name: item.name,
      version: item.version,
      type: item.kind,
      source: item.source,
      dependencies: dependencies.map((childName: string) => buildNode(childName, [...path, name]))
    }
  }

  return buildNode(root.name)
}

function upsertDependency(content: string, dependency: FlutterDependencyArgs & { type: FlutterDependencyType; version: string }): string {
  let nextContent = content
  for (const section of DEPENDENCY_SECTIONS) {
    nextContent = removeDependency(nextContent, dependency.packageName, section)
  }

  const lines = ensureSection(nextContent.split(/\r?\n/), dependency.type)
  const range = sectionRange(lines.join('\n'), dependency.type)
  if (!range) return ensureTrailingNewline(lines.join('\n'))

  const insertAt = range.end
  const dependencyLines = formatDependencyLines(dependency)
  lines.splice(insertAt, 0, ...dependencyLines)
  return ensureTrailingNewline(lines.join('\n'))
}

function removeDependency(content: string, packageName: string, section?: FlutterDependencyType): string {
  const sections = section ? [section] : DEPENDENCY_SECTIONS
  let lines = content.split(/\r?\n/)

  for (const targetSection of sections) {
    const range = sectionRange(lines.join('\n'), targetSection)
    if (!range) continue

    for (let index = range.start + 1; index < range.end; index += 1) {
      const match = lines[index].match(/^(\s{2})([A-Za-z0-9_.-]+):/)
      if (!match || match[2] !== packageName) continue

      let removeEnd = index + 1
      while (removeEnd < range.end && lineIndent(lines[removeEnd]) > 2) {
        removeEnd += 1
      }
      lines.splice(index, removeEnd - index)
      break
    }
  }

  return ensureTrailingNewline(lines.join('\n'))
}

function formatDependencyLines(dependency: FlutterDependencyArgs & { type: FlutterDependencyType; version: string }): string[] {
  const name = dependency.packageName.trim()
  const source = dependency.source || 'hosted'
  if (source === 'sdk') {
    return [`  ${name}:`, `    sdk: ${dependency.sdk || 'flutter'}`]
  }
  if (source === 'path') {
    return [`  ${name}:`, `    path: ${dependency.path || dependency.version}`]
  }
  if (source === 'git') {
    return [`  ${name}:`, `    git: ${dependency.git || dependency.version}`]
  }
  return [`  ${name}: ${dependency.version || 'any'}`]
}

function upsertAsset(content: string, assetPath: string): string {
  const assets = parseAssets(content)
  if (assets.some((asset) => asset.path === assetPath)) return ensureTrailingNewline(content)

  let lines = content.split(/\r?\n/)
  lines = ensureSection(lines, 'flutter')
  const flutterRange = sectionRange(lines.join('\n'), 'flutter')
  if (!flutterRange) return ensureTrailingNewline(lines.join('\n'))

  let assetsHeader = -1
  for (let index = flutterRange.start + 1; index < flutterRange.end; index += 1) {
    if (lineIndent(lines[index]) === 2 && lines[index].trim().startsWith('assets:')) {
      assetsHeader = index
      break
    }
  }

  if (assetsHeader < 0) {
    lines.splice(flutterRange.start + 1, 0, '  assets:', `    - ${assetPath}`)
    return ensureTrailingNewline(lines.join('\n'))
  }

  let insertAt = assetsHeader + 1
  while (insertAt < flutterRange.end && lineIndent(lines[insertAt]) > 2) {
    insertAt += 1
  }
  lines.splice(insertAt, 0, `    - ${assetPath}`)
  return ensureTrailingNewline(lines.join('\n'))
}

function removeAsset(content: string, assetPath: string): string {
  const lines = content.split(/\r?\n/)
  const range = sectionRange(content, 'flutter')
  if (!range) return ensureTrailingNewline(content)

  for (let index = range.start + 1; index < range.end; index += 1) {
    const match = lines[index].trim().match(/^-\s+(.+)$/)
    if (match && stripYamlValue(match[1]) === assetPath) {
      lines.splice(index, 1)
      break
    }
  }

  return ensureTrailingNewline(lines.join('\n'))
}

function ensureSection(lines: string[], section: string): string[] {
  if (sectionRange(lines.join('\n'), section)) return lines
  const nextLines = [...lines]
  while (nextLines.length > 0 && nextLines[nextLines.length - 1] === '') {
    nextLines.pop()
  }
  if (nextLines.length > 0) nextLines.push('')
  nextLines.push(`${section}:`)
  return nextLines
}

function sectionRange(content: string, section: string): { start: number; end: number } | null {
  const lines = content.split(/\r?\n/)
  const start = lines.findIndex((line) => new RegExp(`^${escapeRegExp(section)}\\s*:`).test(line))
  if (start < 0) return null

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z_][\w-]*\s*:/.test(lines[index])) {
      end = index
      break
    }
  }
  return { start, end }
}

function readTopLevelValue(content: string, key: string): string {
  const line = content.split(/\r?\n/).find((item) => new RegExp(`^${escapeRegExp(key)}\\s*:`).test(item))
  if (!line) return ''
  return stripYamlValue(line.replace(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*`), ''))
}

function readNestedValue(content: string, section: string, key: string): string {
  const range = sectionRange(content, section)
  if (!range) return ''
  const lines = content.split(/\r?\n/)
  for (let index = range.start + 1; index < range.end; index += 1) {
    const match = lines[index].match(new RegExp(`^\\s+${escapeRegExp(key)}\\s*:\\s*(.+)$`))
    if (match) return stripYamlValue(match[1])
  }
  return ''
}

function resolveDependencyDisplayVersion(inlineValue: string, nested: string): string {
  if (!inlineValue) return readBlockValue(nested, 'version')
  if (inlineValue.startsWith('{')) {
    return readInlineObjectValue(inlineValue, 'version') || readInlineObjectValue(inlineValue, 'sdk') || readInlineObjectValue(inlineValue, 'path') || readInlineObjectValue(inlineValue, 'git')
  }
  return inlineValue
}

function resolveDependencySource(inlineValue: string, nested: string): FlutterDependencySource {
  if (readInlineObjectValue(inlineValue, 'sdk') || readBlockValue(nested, 'sdk')) return 'sdk'
  if (readInlineObjectValue(inlineValue, 'path') || readBlockValue(nested, 'path')) return 'path'
  if (readInlineObjectValue(inlineValue, 'git') || readBlockValue(nested, 'git') || readBlockValue(nested, 'url')) return 'git'
  return 'hosted'
}

function inferDependencySource(args: FlutterDependencyArgs): FlutterDependencySource {
  if (args.sdk) return 'sdk'
  if (args.path) return 'path'
  if (args.git) return 'git'
  return 'hosted'
}

function readBlockValue(content: string, key: string): string {
  const match = content.match(new RegExp(`^\\s+${escapeRegExp(key)}\\s*:\\s*(.+)$`, 'm'))
  return match ? stripYamlValue(match[1]) : ''
}

function readInlineObjectValue(value: string, key: string): string {
  const match = value.match(new RegExp(`\\b${escapeRegExp(key)}\\s*:\\s*([^,}]+)`))
  return match ? stripYamlValue(match[1]) : ''
}

function stripYamlValue(value: string): string {
  return value
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
}

function normalizeAssetPath(value: string): string {
  return value.trim().replace(/\\/g, '/')
}

async function readLockedPackages(cwd: string): Promise<Array<{ name: string; version: string; dependencyType?: string; source?: string }>> {
  try {
    const content = await readFile(join(cwd, 'pubspec.lock'), 'utf-8')
    return parsePubspecLockPackages(content)
  } catch {
    return []
  }
}

function parsePubspecLockPackages(content: string): Array<{ name: string; version: string; dependencyType?: string; source?: string }> {
  const packages: Array<{ name: string; version: string; dependencyType?: string; source?: string }> = []
  const lines = content.split(/\r?\n/)
  let inPackages = false
  let current: { name: string; version: string; dependencyType?: string; source?: string } | null = null

  const pushCurrent = () => {
    if (current?.name && current.version && (!current.source || current.source === 'hosted')) {
      packages.push(current)
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, '')
    if (/^packages:\s*$/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages && /^[A-Za-z_][\w-]*:\s*$/.test(line)) {
      pushCurrent()
      break
    }
    if (!inPackages) continue

    const packageMatch = line.match(/^\s{2}([A-Za-z0-9_.-]+):\s*$/)
    if (packageMatch) {
      pushCurrent()
      current = { name: packageMatch[1], version: '' }
      continue
    }

    if (!current) continue
    const propertyMatch = line.match(/^\s{4}([A-Za-z_][\w-]*):\s*(.+)$/)
    if (!propertyMatch) continue
    const value = stripYamlValue(propertyMatch[2])
    if (propertyMatch[1] === 'version') current.version = value
    if (propertyMatch[1] === 'dependency') current.dependencyType = value
    if (propertyMatch[1] === 'source') current.source = value
  }

  pushCurrent()
  return uniqueLockedPackages(packages)
}

function uniqueLockedPackages(packages: Array<{ name: string; version: string; dependencyType?: string; source?: string }>) {
  const seen = new Set<string>()
  return packages.filter((item) => {
    const key = `${item.name}@${item.version}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function exactVersionOrEmpty(value: string): string {
  const normalized = value.trim()
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(normalized) ? normalized : ''
}

function buildSecurityIssue(
  dependency: { name: string; version: string; dependencyType?: string; source?: string },
  vuln: any
): FlutterSecurityIssue {
  const affected = findAffectedPubPackage(vuln, dependency.name)
  return {
    packageName: dependency.name,
    version: dependency.version,
    dependencyType: dependency.dependencyType,
    source: dependency.source,
    id: vuln.id || '',
    summary: vuln.summary || vuln.details?.split(/\r?\n/)[0] || vuln.id || 'Known vulnerability',
    details: vuln.details,
    severity: normalizeSeverity(vuln, affected),
    aliases: Array.isArray(vuln.aliases) ? vuln.aliases : [],
    published: vuln.published,
    modified: vuln.modified,
    affectedRange: affectedRangeText(affected),
    fixedVersion: firstFixedVersion(affected),
    references: Array.isArray(vuln.references) ? vuln.references.filter((item: any) => item?.url) : [],
    url: `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id || '')}`
  }
}

function findAffectedPubPackage(vuln: any, packageName: string): any {
  const affected = Array.isArray(vuln?.affected) ? vuln.affected : []
  return affected.find((item: any) => item?.package?.name === packageName && item?.package?.ecosystem === 'Pub')
    || affected.find((item: any) => item?.package?.name === packageName)
    || affected[0]
}

function normalizeSeverity(vuln: any, affected: any): FlutterSecurityIssue['severity'] {
  const raw = [
    vuln?.database_specific?.severity,
    affected?.database_specific?.severity,
    affected?.ecosystem_specific?.severity,
    ...(Array.isArray(vuln?.severity) ? vuln.severity.map((item: any) => item?.score || item?.type) : [])
  ].filter(Boolean).join(' ').toLowerCase()

  if (raw.includes('critical') || raw.includes('cvss_v4') && /9\./.test(raw)) return 'critical'
  if (raw.includes('high')) return 'high'
  if (raw.includes('moderate') || raw.includes('medium')) return 'medium'
  if (raw.includes('low')) return 'low'
  if (raw.includes('info')) return 'info'
  if (String(vuln?.id || '').startsWith('MAL-')) return 'critical'
  return 'unknown'
}

function affectedRangeText(affected: any): string {
  if (!affected) return ''
  const ranges = Array.isArray(affected.ranges) ? affected.ranges : []
  const rangeText = ranges.flatMap((range: any) => {
    const events = Array.isArray(range.events) ? range.events : []
    return events.map((event: any) => {
      if (event.introduced !== undefined) return `introduced ${event.introduced}`
      if (event.fixed !== undefined) return `fixed ${event.fixed}`
      if (event.last_affected !== undefined) return `last affected ${event.last_affected}`
      return ''
    }).filter(Boolean)
  })
  if (rangeText.length > 0) return rangeText.join(', ')
  return Array.isArray(affected.versions) ? affected.versions.join(', ') : ''
}

function firstFixedVersion(affected: any): string {
  const ranges = Array.isArray(affected?.ranges) ? affected.ranges : []
  for (const range of ranges) {
    const events = Array.isArray(range.events) ? range.events : []
    const fixed = events.find((event: any) => event.fixed !== undefined)?.fixed
    if (fixed) return fixed
  }
  return ''
}

function uniqueSecurityIssues(issues: FlutterSecurityIssue[]): FlutterSecurityIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.packageName}:${issue.version}:${issue.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function validateDependencyArgs(args: FlutterDependencyArgs): void {
  if (!args.cwd?.trim()) throw new Error('Project path is required')
  if (!args.packageName?.trim()) throw new Error('Package name is required')
  if (args.source === 'path' && !args.path?.trim()) throw new Error('Path dependency requires a path')
  if (args.source === 'git' && !args.git?.trim()) throw new Error('Git dependency requires a git URL')
}

function parseJson<T>(value: string, fallback: T): T {
  if (!value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

async function httpsGet(url: string): Promise<string> {
  const https = await import('https')
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'npmDesktopManager/1.0' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function httpsPostJson(url: string, payload: unknown): Promise<string> {
  const https = await import('https')
  const body = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'npmDesktopManager/1.0'
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(data || `HTTP ${res.statusCode}`))
          return
        }
        resolve(data)
      })
    })
    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function lineIndent(line: string): number {
  return line.match(/^\s*/)?.[0].length || 0
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function numberOrUndefined(value: any): number | undefined {
  return typeof value === 'number' ? value : undefined
}
