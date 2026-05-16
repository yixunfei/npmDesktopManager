import { access, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { resolveToolBin } from './toolchain'

export interface GradleDependency {
  groupId: string
  artifactId: string
  version: string
  configuration: string
}

export interface GradleSearchResult extends GradleDependency {
  latestVersion?: string
  description?: string
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

  async search(query: string): Promise<GradleSearchResult[]> {
    const normalized = query.trim()
    if (!normalized) return []
    const searchQuery = buildMavenSearchQuery(normalized)
    try {
      const data = JSON.parse(await httpsGet(`https://search.maven.org/solrsearch/select?q=${encodeURIComponent(searchQuery)}&rows=20&wt=json`))
      const docs = data.response?.docs || []
      return docs.map((doc: any) => ({
        groupId: doc.g,
        artifactId: doc.a,
        version: doc.latestVersion || '',
        latestVersion: doc.latestVersion || '',
        configuration: 'implementation',
        description: 'Maven Central'
      })).filter((item: GradleSearchResult) => item.groupId && item.artifactId)
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

function buildMavenSearchQuery(query: string): string {
  const [groupId, artifactId] = query.split(':').map((part) => part.trim())
  if (groupId && artifactId) return `g:"${groupId}" AND a:"${artifactId}"`
  if (groupId && query.includes(':')) return `g:"${groupId}"`
  return query
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

function splitCommandLine(commandLine: string): string[] {
  return commandLine
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
}
