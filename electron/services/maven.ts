import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export interface MavenDependency {
  groupId: string
  artifactId: string
  version: string
  scope?: string
  type?: string
}

export interface MavenGlobalInfo {
  version: string
  localRepository: string
  settingsPath: string
  hasSettings: boolean
}

export interface MavenAuditIssue {
  dependency: string
  fileName?: string
  severity: string
  name: string
  description: string
  url?: string
}

export interface MavenSearchResult extends MavenDependency {
  latestVersion?: string
  description?: string
}

export interface MavenDependencyTreeNode extends MavenDependency {
  name: string
  dependencies: MavenDependencyTreeNode[]
}

export interface MavenDeployArgs {
  cwd: string
  repositoryId?: string
  repositoryUrl?: string
  skipTests?: boolean
  goals?: string
}

function dependencyKey(dep: Pick<MavenDependency, 'groupId' | 'artifactId'>): string {
  return `${dep.groupId}:${dep.artifactId}`
}

function parsePomDependencies(content: string): MavenDependency[] {
  const dependencies: MavenDependency[] = []
  const dependencyBlocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) || []

  for (const block of dependencyBlocks) {
    const readTag = (tag: string) => block.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`))?.[1]?.trim() || ''
    const groupId = readTag('groupId')
    const artifactId = readTag('artifactId')

    if (groupId && artifactId) {
      dependencies.push({
        groupId,
        artifactId,
        version: readTag('version'),
        scope: readTag('scope') || undefined,
        type: readTag('type') || undefined
      })
    }
  }

  return dependencies
}

function renderDependency(dep: MavenDependency): string {
  const scope = dep.scope ? `\n      <scope>${dep.scope}</scope>` : ''
  const type = dep.type ? `\n      <type>${dep.type}</type>` : ''
  return [
    '    <dependency>',
    `      <groupId>${dep.groupId}</groupId>`,
    `      <artifactId>${dep.artifactId}</artifactId>`,
    `      <version>${dep.version}</version>${scope}${type}`,
    '    </dependency>'
  ].join('\n')
}

function removeDependencyBlock(content: string, dep: Pick<MavenDependency, 'groupId' | 'artifactId'>): string {
  const blocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) || []
  let nextContent = content

  for (const block of blocks) {
    const parsed = parsePomDependencies(`<dependencies>${block}</dependencies>`)[0]
    if (parsed && dependencyKey(parsed) === dependencyKey(dep)) {
      nextContent = nextContent.replace(block, '').replace(/\n{3,}/g, '\n\n')
      break
    }
  }

  return nextContent
}

function parseMavenListOutput(output: string): MavenDependency[] {
  const dependencies: MavenDependency[] = []
  const seen = new Set<string>()

  for (const line of output.split(/\r?\n/)) {
    const cleanLine = line.replace(/^\[INFO\]\s*/, '').trim()
    const match = cleanLine.match(/^([^:\s]+):([^:\s]+):([^:\s]+):([^:\s]+)(?::([^:\s]+))?$/)
    if (!match) continue

    const dep = {
      groupId: match[1],
      artifactId: match[2],
      type: match[3],
      version: match[4],
      scope: match[5]
    }
    const key = `${dependencyKey(dep)}:${dep.version}:${dep.scope || ''}`
    if (!seen.has(key)) {
      dependencies.push(dep)
      seen.add(key)
    }
  }

  return dependencies
}

export class MavenService {
  private async executeMaven(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
    try {
      return await runLoggedCommand(await resolveToolBin('maven', cwd), args, {
        cwd,
        maxBuffer: 1024 * 1024 * 20,
        displayBin: 'mvn'
      })
    } catch (error: any) {
      const wrapped = new Error(error.message || 'maven command failed') as Error & { stdout?: string; stderr?: string }
      wrapped.stdout = error.stdout
      wrapped.stderr = error.stderr
      throw wrapped
    }
  }

  async detect(cwd: string): Promise<{ hasPom: boolean; path: string }> {
    const pomPath = join(cwd, 'pom.xml')
    try {
      await access(pomPath)
      return { hasPom: true, path: pomPath }
    } catch {
      return { hasPom: false, path: pomPath }
    }
  }

  async list(cwd: string): Promise<MavenDependency[]> {
    const pom = await readFile(join(cwd, 'pom.xml'), 'utf-8')
    const declared = parsePomDependencies(pom)

    try {
      const { stdout } = await this.executeMaven(['dependency:list', '-DincludeTransitive=false'], cwd)
      const resolved = parseMavenListOutput(stdout)
      return resolved.length > 0 ? resolved : declared
    } catch {
      return declared
    }
  }

  async tree(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeMaven(['dependency:tree'], cwd)
    return stdout || stderr
  }

  async dependencyTree(cwd: string): Promise<MavenDependencyTreeNode | null> {
    try {
      const { stdout, stderr } = await this.executeMaven(['dependency:tree', '-DoutputType=json'], cwd)
      const parsed = parseMavenJsonTree(stdout || stderr)
      if (parsed) return parsed
      return parseMavenTextTree(stdout || stderr)
    } catch (error: any) {
      const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n')
      return parseMavenTextTree(output)
    }
  }

  async runGoal(cwd: string, goal: string): Promise<string> {
    const args = goal.split(/\s+/).map((part) => part.trim()).filter(Boolean)
    if (args.length === 0) {
      throw new Error('Maven goal is required')
    }
    const { stdout, stderr } = await this.executeMaven(args, cwd)
    return stdout || stderr
  }

  async search(query: string, cwd?: string): Promise<MavenSearchResult[]> {
    const normalized = query.trim()
    if (!normalized) return []

    const [local, remote] = await Promise.allSettled([
      this.searchLocal(normalized, cwd),
      this.searchRemote(normalized)
    ])

    const localResults = local.status === 'fulfilled' ? local.value : []
    const remoteResults = remote.status === 'fulfilled' ? remote.value : []
    return uniqueMavenResults([...localResults, ...remoteResults]).slice(0, 20)
  }

  private async searchRemote(query: string): Promise<MavenSearchResult[]> {
    const normalized = query.trim()
    const searchQuery = buildMavenSearchQuery(normalized)
    try {
      const data = JSON.parse(await httpsGet(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(searchQuery)}&rows=12&wt=json`))
      const docs = data.response?.docs || []
      return uniqueMavenResults(docs.map((doc: any) => ({
        groupId: doc.g,
        artifactId: doc.a,
        version: doc.latestVersion || '',
        latestVersion: doc.latestVersion || '',
        type: doc.p,
        description: 'Maven Central'
      })).filter((item: MavenSearchResult) => item.groupId && item.artifactId))
    } catch {
      return []
    }
  }

  private async searchLocal(query: string, cwd?: string): Promise<MavenSearchResult[]> {
    const results: MavenSearchResult[] = []
    const normalized = query.toLowerCase()

    if (cwd) {
      try {
        const pom = await readFile(join(cwd, 'pom.xml'), 'utf-8')
        results.push(...parsePomDependencies(pom)
          .filter((dep) => mavenResultMatches(dep, normalized))
          .map((dep) => ({
            ...dep,
            latestVersion: dep.version,
            description: 'Current project pom.xml'
          })))
      } catch {
      }
    }

    try {
      const repository = await this.localRepositoryFromSettings()
      results.push(...await searchLocalMavenRepository(repository, normalized))
    } catch {
    }

    return uniqueMavenResults(results).slice(0, 12)
  }

  async versions(groupId: string, artifactId: string): Promise<string[]> {
    if (!groupId.trim() || !artifactId.trim()) return []
    try {
      const query = `g:"${groupId.trim()}" AND a:"${artifactId.trim()}"`
      const data = JSON.parse(await httpsGet(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&core=gav&rows=10&wt=json`))
      const docs = data.response?.docs || []
      return docs
        .map((doc: any) => doc.v)
        .filter(Boolean)
        .slice(0, 10)
    } catch {
      return []
    }
  }

  async info(cwd?: string): Promise<MavenGlobalInfo> {
    const settingsPath = this.settingsPath()
    const [version, localRepository, hasSettings] = await Promise.all([
      this.version(cwd),
      this.localRepository(cwd),
      this.hasSettings()
    ])

    return {
      version,
      localRepository,
      settingsPath,
      hasSettings
    }
  }

  async version(cwd?: string): Promise<string> {
    try {
      const { stdout, stderr } = await this.executeMaven(['-version'], cwd)
      return (stdout || stderr).trim()
    } catch (error: any) {
      return error.stdout || error.stderr || error.message
    }
  }

  async localRepository(cwd?: string): Promise<string> {
    try {
      const { stdout } = await this.executeMaven(['help:evaluate', '-Dexpression=settings.localRepository', '-q', '-DforceStdout'], cwd)
      return stdout.trim()
    } catch {
      return join(homedir(), '.m2', 'repository')
    }
  }

  async effectiveSettings(cwd?: string): Promise<string> {
    const { stdout, stderr } = await this.executeMaven(['help:effective-settings'], cwd)
    return stdout || stderr
  }

  async ensureSettings(): Promise<string> {
    const settingsPath = this.settingsPath()
    try {
      await access(settingsPath)
    } catch {
      await mkdir(dirname(settingsPath), { recursive: true })
      await writeFile(settingsPath, defaultSettingsXml(), 'utf-8')
    }
    return settingsPath
  }

  async backupSettings(): Promise<string> {
    const settingsPath = await this.ensureSettings()
    const backupPath = `${settingsPath}.bak`
    await copyFile(settingsPath, backupPath)
    return backupPath
  }

  async setLocalRepository(repositoryPath: string): Promise<void> {
    if (!repositoryPath.trim()) {
      throw new Error('Local repository path is required')
    }

    const settingsPath = await this.ensureSettings()
    const content = await readFile(settingsPath, 'utf-8')
    const value = escapeXml(repositoryPath.trim())
    const tag = `<localRepository>${value}</localRepository>`
    const nextContent = content.includes('<localRepository>')
      ? content.replace(/<localRepository>[\s\S]*?<\/localRepository>/, tag)
      : content.replace(/<\/settings>/, `  ${tag}\n</settings>`)

    await writeFile(settingsPath, nextContent, 'utf-8')
  }

  async setMirror(id: string, url: string, mirrorOf = 'central'): Promise<void> {
    if (!id.trim() || !url.trim()) {
      throw new Error('Mirror id and url are required')
    }

    const settingsPath = await this.ensureSettings()
    const content = await readFile(settingsPath, 'utf-8')
    const mirrorXml = [
      '    <mirror>',
      `      <id>${escapeXml(id.trim())}</id>`,
      `      <mirrorOf>${escapeXml(mirrorOf.trim())}</mirrorOf>`,
      `      <url>${escapeXml(url.trim())}</url>`,
      '    </mirror>'
    ].join('\n')
    const nextContent = upsertSettingsBlock(content, 'mirrors', mirrorXml, id.trim())
    await writeFile(settingsPath, nextContent, 'utf-8')
  }

  async setServer(id: string, username: string, password: string): Promise<void> {
    if (!id.trim() || !username.trim() || !password.trim()) {
      throw new Error('Server id, username and password are required')
    }

    const settingsPath = await this.ensureSettings()
    const content = await readFile(settingsPath, 'utf-8')
    const serverXml = [
      '    <server>',
      `      <id>${escapeXml(id.trim())}</id>`,
      `      <username>${escapeXml(username.trim())}</username>`,
      `      <password>${escapeXml(password.trim())}</password>`,
      '    </server>'
    ].join('\n')
    const nextContent = upsertSettingsBlock(content, 'servers', serverXml, id.trim())
    await writeFile(settingsPath, nextContent, 'utf-8')
  }

  async deploy(args: MavenDeployArgs): Promise<string> {
    const goals = (args.goals || 'deploy')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)

    if (goals.length === 0) {
      goals.push('deploy')
    }

    const command = [...goals]
    if (args.skipTests) command.push('-DskipTests')
    if (args.repositoryId && args.repositoryUrl) {
      command.push(`-DaltDeploymentRepository=${args.repositoryId}::default::${args.repositoryUrl}`)
    }

    const { stdout, stderr } = await this.executeMaven(command, args.cwd)
    return stdout || stderr
  }

  async securityAudit(cwd: string): Promise<{ issues: MavenAuditIssue[]; reportPath: string; raw?: string; error?: string }> {
    const reportPath = join(cwd, 'target', 'dependency-check-report.json')
    try {
      await this.executeMaven([
        'org.owasp:dependency-check-maven:check',
        '-Dformat=JSON',
        '-DfailBuildOnCVSS=11'
      ], cwd)
    } catch (error: any) {
      try {
        const content = await readFile(reportPath, 'utf-8')
        return {
          issues: parseDependencyCheckReport(content),
          reportPath,
          raw: content,
          error: error.stderr || undefined
        }
      } catch {
        return {
          issues: [],
          reportPath,
          error: error.stderr || error.message || 'Maven security audit failed'
        }
      }
    }

    try {
      const content = await readFile(reportPath, 'utf-8')
      return {
        issues: parseDependencyCheckReport(content),
        reportPath,
        raw: content
      }
    } catch {
      return {
        issues: [],
        reportPath
      }
    }
  }

  async goOffline(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeMaven(['dependency:go-offline'], cwd)
    return stdout || stderr
  }

  async purgeLocalRepository(cwd: string): Promise<string> {
    const { stdout, stderr } = await this.executeMaven(['dependency:purge-local-repository', '-DreResolve=false'], cwd)
    return stdout || stderr
  }

  async addDependency(cwd: string, dep: MavenDependency): Promise<void> {
    if (!dep.groupId || !dep.artifactId || !dep.version) {
      throw new Error('groupId, artifactId and version are required')
    }

    const pomPath = join(cwd, 'pom.xml')
    const content = await readFile(pomPath, 'utf-8')
    const withoutExisting = removeDependencyBlock(content, dep)
    const dependencyXml = renderDependency(dep)

    let nextContent: string
    if (withoutExisting.includes('</dependencies>')) {
      nextContent = withoutExisting.replace(/<\/dependencies>/, `${dependencyXml}\n  </dependencies>`)
    } else {
      nextContent = withoutExisting.replace(/<\/project>/, `  <dependencies>\n${dependencyXml}\n  </dependencies>\n</project>`)
    }

    await writeFile(pomPath, nextContent, 'utf-8')
  }

  async removeDependency(cwd: string, dep: Pick<MavenDependency, 'groupId' | 'artifactId'>): Promise<void> {
    const pomPath = join(cwd, 'pom.xml')
    const content = await readFile(pomPath, 'utf-8')
    await writeFile(pomPath, removeDependencyBlock(content, dep), 'utf-8')
  }

  private settingsPath(): string {
    return join(homedir(), '.m2', 'settings.xml')
  }

  private async localRepositoryFromSettings(): Promise<string> {
    try {
      const content = await readFile(this.settingsPath(), 'utf-8')
      const value = content.match(/<localRepository>\s*([\s\S]*?)\s*<\/localRepository>/)?.[1]?.trim()
      if (value) return value
    } catch {
    }
    return join(homedir(), '.m2', 'repository')
  }

  private async hasSettings(): Promise<boolean> {
    try {
      await access(this.settingsPath())
      return true
    } catch {
      return false
    }
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

function defaultSettingsXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"',
    '          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.2.0 https://maven.apache.org/xsd/settings-1.2.0.xsd">',
    '</settings>',
    ''
  ].join('\n')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function upsertSettingsBlock(content: string, blockName: string, itemXml: string, id: string): string {
  const itemName = blockName.endsWith('s') ? blockName.slice(0, -1) : blockName
  const itemRegex = new RegExp(`<${itemName}>[\\s\\S]*?<id>\\s*${escapeRegExp(id)}\\s*<\\/id>[\\s\\S]*?<\\/${itemName}>`)

  if (itemRegex.test(content)) {
    return content.replace(itemRegex, itemXml)
  }

  if (content.includes(`<${blockName}>`)) {
    return content.replace(new RegExp(`</${blockName}>`), `${itemXml}\n  </${blockName}>`)
  }

  return content.replace(/<\/settings>/, `  <${blockName}>\n${itemXml}\n  </${blockName}>\n</settings>`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildMavenSearchQuery(query: string): string {
  const [groupId, artifactId] = query.split(':').map((part) => part.trim())
  if (groupId && artifactId) {
    return `g:"${groupId}" AND a:"${artifactId}"`
  }
  if (groupId && query.includes(':')) {
    return `g:"${groupId}"`
  }
  return query
}

function mavenResultMatches(dep: Pick<MavenDependency, 'groupId' | 'artifactId'>, normalizedQuery: string): boolean {
  const coordinate = `${dep.groupId}:${dep.artifactId}`.toLowerCase()
  return coordinate.includes(normalizedQuery)
    || dep.groupId.toLowerCase().includes(normalizedQuery)
    || dep.artifactId.toLowerCase().includes(normalizedQuery)
}

async function searchLocalMavenRepository(repository: string, normalizedQuery: string): Promise<MavenSearchResult[]> {
  const results: MavenSearchResult[] = []
  let visited = 0
  const maxVisited = 5000
  const maxDepth = 8

  async function walk(dir: string, segments: string[]): Promise<void> {
    if (results.length >= 20 || visited >= maxVisited || segments.length > maxDepth) return
    visited++

    const entries = await readDirSafe(dir)
    if (entries.length === 0) return

    const directoryEntries = entries.filter((entry) => entry.isDirectory())
    const versionEntries = directoryEntries.filter((entry) => looksLikeMavenVersion(entry.name))
    const artifactId = segments[segments.length - 1]
    const groupSegments = segments.slice(0, -1)

    if (artifactId && groupSegments.length > 0 && versionEntries.length > 0) {
      const groupId = groupSegments.join('.')
      const dep: MavenSearchResult = {
        groupId,
        artifactId,
        version: newestVersion(versionEntries.map((entry) => entry.name)),
        latestVersion: newestVersion(versionEntries.map((entry) => entry.name)),
        description: 'Local Maven repository'
      }
      if (mavenResultMatches(dep, normalizedQuery)) {
        results.push(dep)
      }
      return
    }

    for (const entry of directoryEntries) {
      if (entry.name.startsWith('.') || entry.name === '_remote.repositories') continue
      await walk(join(dir, entry.name), [...segments, entry.name])
      if (results.length >= 20 || visited >= maxVisited) break
    }
  }

  await walk(repository, [])
  return uniqueMavenResults(results)
}

async function readDirSafe(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function looksLikeMavenVersion(value: string): boolean {
  return /\d/.test(value) && /^[A-Za-z0-9_.+-]+$/.test(value)
}

function newestVersion(versions: string[]): string {
  const sorted = versions
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  return sorted[sorted.length - 1] || ''
}

function parseDependencyCheckReport(content: string): MavenAuditIssue[] {
  try {
    const report = JSON.parse(content)
    const dependencies = Array.isArray(report.dependencies) ? report.dependencies : []
    return dependencies.flatMap((dep: any) => {
      const vulns = Array.isArray(dep.vulnerabilities) ? dep.vulnerabilities : []
      return vulns.map((vuln: any) => ({
        dependency: dep.fileName || dep.filePath || '',
        fileName: dep.fileName,
        severity: vuln.severity || 'UNKNOWN',
        name: vuln.name || vuln.source || '安全问题',
        description: vuln.description || '发现已知安全风险',
        url: vuln.references?.[0]?.url
      }))
    })
  } catch {
    return []
  }
}

function uniqueMavenResults(items: MavenSearchResult[]): MavenSearchResult[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.groupId}:${item.artifactId}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseMavenJsonTree(stdout: string): MavenDependencyTreeNode | null {
  const jsonText = extractJson(stdout)
  if (!jsonText) return null

  try {
    const parsed = JSON.parse(jsonText)
    return normalizeMavenTreeNode(parsed)
  } catch {
    return null
  }
}

function parseMavenTextTree(output: string): MavenDependencyTreeNode | null {
  const lines = output.split(/\r?\n/)
  const stack: Array<{ depth: number; node: MavenDependencyTreeNode }> = []
  let root: MavenDependencyTreeNode | null = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/^\[INFO\]\s?/, '')
    if (!line.trim()) continue
    if (!line.includes(':')) continue

    const parsed = parseMavenDependencyLine(line)
    if (!parsed) continue

    const node: MavenDependencyTreeNode = {
      name: `${parsed.groupId}:${parsed.artifactId}`,
      groupId: parsed.groupId,
      artifactId: parsed.artifactId,
      version: parsed.version,
      scope: parsed.scope,
      type: parsed.type,
      dependencies: []
    }

    if (stack.length === 0) {
      root = node
      stack.push({ depth: parsed.depth, node })
      continue
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= parsed.depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]?.node
    if (parent) {
      parent.dependencies.push(node)
    } else if (!root) {
      root = node
    }

    stack.push({ depth: parsed.depth, node })
  }

  return root
}

function parseMavenDependencyLine(line: string): (MavenDependency & { depth: number }) | null {
  const trimmed = line.replace(/\s+$/, '')
  const markerIndex = trimmed.search(/(?:\+-|\\-)\s/)
  const dependencyText = markerIndex >= 0 ? trimmed.slice(markerIndex + 3).trim() : trimmed.trim()
  const prefix = markerIndex >= 0 ? trimmed.slice(0, markerIndex) : ''
  const depth = markerIndex >= 0 ? Math.max(0, Math.floor(prefix.length / 3) + 1) : 0
  const parts = dependencyText.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 4) return null

  const groupId = parts[0]
  const artifactId = parts[1]
  const type = parts[2]
  const version = parts.length >= 5 ? parts[parts.length - 2] : parts[3]
  const scope = parts.length >= 5 ? parts[parts.length - 1] : undefined

  return {
    depth,
    groupId,
    artifactId,
    type,
    version,
    scope
  }
}

function normalizeMavenTreeNode(node: any): MavenDependencyTreeNode | null {
  if (!node) return null

  if (Array.isArray(node)) {
    if (node.length === 0) return null
    const root = node[0]
    return normalizeMavenTreeNode(root)
  }

  const rawDependencies = node.children || node.dependencies || node.dependencyNodes || []
  const dependencies = Array.isArray(rawDependencies)
    ? rawDependencies.map((item) => normalizeMavenTreeNode(item)).filter(Boolean) as MavenDependencyTreeNode[]
    : []

  const groupId = node.groupId || node.g || node.group || ''
  const artifactId = node.artifactId || node.a || node.artifact || ''
  const version = node.version || node.v || node.resolvedVersion || ''

  if (!groupId && !artifactId) {
    return dependencies[0] || null
  }

  return {
    name: `${groupId}:${artifactId}`,
    groupId,
    artifactId,
    version,
    scope: node.scope,
    type: node.type || node.packaging,
    dependencies
  }
}

function extractJson(output: string): string | null {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return output.slice(start, end + 1)
}
