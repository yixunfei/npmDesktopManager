import { access, readFile } from 'fs/promises'
import { join } from 'path'
import { runLoggedCommand } from './commandRunner'
import { PipService } from './pip'
import { NativeService, type NativeDependencyInfo } from './native'
import { resolveToolBin, type ToolName } from './toolchain'

export type DependencyHealthManager = 'npm' | 'pip' | 'maven' | 'gradle' | 'cargo' | 'go' | 'native'
export type DependencyHealthSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type DependencyHealthIssueType =
  | 'cycle'
  | 'version-conflict'
  | 'peer-conflict'
  | 'missing'
  | 'invalid'
  | 'extraneous'
  | 'tooling'
  | 'native-linkage'
  | 'unmanaged'
  | 'configuration'

export interface DependencyHealthAction {
  id: string
  label: string
  kind: 'command' | 'api' | 'openFile' | 'copy' | 'manual'
  description?: string
  command?: {
    tool: ToolName
    args: string[]
    displayBin?: string
  }
  target?: string
  payload?: string
}

export interface DependencyHealthIssue {
  id: string
  manager: DependencyHealthManager
  type: DependencyHealthIssueType
  severity: DependencyHealthSeverity
  dependency?: string
  title: string
  description: string
  suggestion: string
  paths?: string[]
  actions: DependencyHealthAction[]
}

export interface DependencyHealthSummary {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  info: number
}

export interface DependencyHealthScanResult {
  manager: DependencyHealthManager
  cwd: string
  scannedAt: string
  summary: DependencyHealthSummary
  issues: DependencyHealthIssue[]
  raw?: string
}

interface NpmTreeNode {
  name?: string
  version?: string
  path?: string
  problems?: string[]
  invalid?: boolean | string
  missing?: boolean | string
  extraneous?: boolean | string
  dependencies?: Record<string, NpmTreeNode>
}

interface MavenLineDependency {
  groupId: string
  artifactId: string
  version: string
  depth: number
  conflictWith?: string
}

interface GradleDependencyLine {
  groupId: string
  artifactId: string
  requested: string
  selected?: string
}

type IssueFactory = (issue: Omit<DependencyHealthIssue, 'id' | 'manager'>) => DependencyHealthIssue

export class DependencyHealthService {
  private pipService = new PipService()
  private nativeService = new NativeService()

  async scan(manager: DependencyHealthManager, cwd: string): Promise<DependencyHealthScanResult> {
    if (!cwd?.trim()) {
      throw new Error('Project path is required')
    }

    let sequence = 0
    const createIssue: IssueFactory = (issue) => ({
      ...issue,
      id: `${manager}-${++sequence}-${slug(issue.type)}-${slug(issue.dependency || issue.title)}`,
      manager
    })

    let issues: DependencyHealthIssue[] = []
    let raw = ''

    try {
      if (manager === 'npm') {
        const result = await this.scanNpm(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else if (manager === 'pip') {
        const result = await this.scanPip(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else if (manager === 'maven') {
        const result = await this.scanMaven(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else if (manager === 'gradle') {
        const result = await this.scanGradle(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else if (manager === 'cargo') {
        const result = await this.scanCargo(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else if (manager === 'go') {
        const result = await this.scanGo(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      } else {
        const result = await this.scanNative(cwd, createIssue)
        issues = result.issues
        raw = result.raw
      }
    } catch (error: any) {
      issues = [createIssue({
        type: 'tooling',
        severity: 'medium',
        title: 'Dependency scan failed',
        description: error.stderr || error.message || 'The dependency diagnostic command failed.',
        suggestion: 'Check the configured tool path and run the package manager command manually once.',
        actions: [openFolderAction(cwd)]
      })]
      raw = error.stdout || error.stderr || error.message || ''
    }

    return {
      manager,
      cwd,
      scannedAt: new Date().toISOString(),
      summary: summarizeIssues(issues),
      issues,
      raw
    }
  }

  async applyFix(cwd: string, action: DependencyHealthAction): Promise<string> {
    if (!cwd?.trim()) throw new Error('Project path is required')

    if (action.kind === 'api' && action.id === 'pip-repair-check') {
      const result = await this.pipService.repairCheck(cwd)
      return result.output || `pip repair completed: ${result.success} success, ${result.failed} failed`
    }

    if (action.kind !== 'command' || !action.command) {
      throw new Error('This diagnostic action is not executable as a command')
    }

    const command = action.command
    const bin = command.tool === 'gradle'
      ? await resolveGradleBin(cwd)
      : await resolveToolBin(command.tool, cwd)

    try {
      const { stdout, stderr } = await runLoggedCommand(bin, command.args, {
        cwd,
        maxBuffer: 1024 * 1024 * 30,
        displayBin: command.displayBin || displayName(command.tool)
      })
      return stdout || stderr || 'Command completed.'
    } catch (error: any) {
      return [error.stdout, error.stderr, error.message].filter(Boolean).join('\n') || 'Command failed.'
    }
  }

  private async scanNpm(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const output = await runToolCapture('npm', ['ls', '--json', '--all', '--long'], cwd)
    const tree = parseJson<NpmTreeNode>(output.stdout, {})
    const issues: DependencyHealthIssue[] = []
    const versions = new Map<string, Map<string, string[]>>()
    const problemKeys = new Set<string>()

    const addProblem = (problem: string, dependency?: string) => {
      const key = `${dependency || ''}:${problem}`
      if (problemKeys.has(key)) return
      problemKeys.add(key)
      issues.push(createIssue(npmProblemToIssue(problem, dependency, cwd)))
    }

    for (const problem of tree.problems || []) {
      addProblem(problem, dependencyFromProblem(problem))
    }

    walkNpmTree(tree, {
      path: [tree.name || 'project'],
      versions,
      onCycle: (dependency, cyclePath) => {
        issues.push(createIssue({
          type: 'cycle',
          severity: 'high',
          dependency,
          title: 'Circular dependency path detected',
          description: `${dependency} appears again in the dependency path.`,
          suggestion: 'Inspect the repeated path and prefer upgrading or replacing one direct dependency that introduces the loop.',
          paths: [cyclePath.join(' > ')],
          actions: [
            commandAction('npm-ls-cycle', 'Show npm tree', 'npm', ['ls', dependency, '--all'], 'Show where this dependency is installed.'),
            openFileAction(join(cwd, 'package.json'))
          ]
        }))
      },
      onProblem: addProblem
    })

    for (const [name, versionPaths] of versions) {
      if (versionPaths.size <= 1) continue
      const versionList = [...versionPaths.keys()].filter(Boolean)
      if (versionList.length <= 1) continue

      issues.push(createIssue({
        type: 'version-conflict',
        severity: 'medium',
        dependency: name,
        title: 'Multiple installed versions',
        description: `${name} is installed as ${versionList.join(', ')} in the same project tree.`,
        suggestion: 'Run npm dedupe first. If the conflict remains, align the direct dependencies that request different ranges.',
        paths: [...versionPaths.values()].flat().slice(0, 8),
        actions: [
          commandAction('npm-dedupe', 'Run npm dedupe', 'npm', ['dedupe'], 'Deduplicate compatible transitive dependencies.'),
          commandAction('npm-explain', 'Explain dependency', 'npm', ['explain', name], 'Show why npm installed this package.'),
          copyAction('npm-conflict-note', 'Copy fix notes', [
            `npm explain ${name}`,
            'npm dedupe',
            `If needed, update the direct dependency that pins ${name} to the older range.`
          ].join('\n'))
        ]
      }))
    }

    return { issues: uniqueIssues(issues), raw: [output.stdout, output.stderr].filter(Boolean).join('\n') }
  }

  private async scanPip(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const raw = await this.pipService.check(cwd)
    const issues: DependencyHealthIssue[] = []

    for (const line of raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      if (/no broken requirements found/i.test(line)) continue
      const missing = line.match(/^(.+?)\s+requires\s+(.+?),\s+which is not installed\.?$/i)
      const conflict = line.match(/^(.+?)\s+has requirement\s+(.+?),\s+but you have\s+(.+?)\.?$/i)

      if (missing) {
        const dependency = missing[2].trim()
        issues.push(createIssue({
          type: 'missing',
          severity: 'high',
          dependency,
          title: 'Missing Python dependency',
          description: line,
          suggestion: 'Install the missing package or update the package that requires it.',
          actions: [
            apiAction('pip-repair-check', 'Run pip self repair', 'Use the existing pip repair helper to install compatible packages.'),
            commandAction('pip-check', 'Run pip check', 'pip', ['check'], 'Re-run pip dependency validation.')
          ]
        }))
        continue
      }

      if (conflict) {
        const dependency = conflict[2].trim()
        issues.push(createIssue({
          type: 'version-conflict',
          severity: 'high',
          dependency,
          title: 'Python requirement conflict',
          description: line,
          suggestion: 'Upgrade the required package or pin a version range that satisfies every installed package.',
          actions: [
            apiAction('pip-repair-check', 'Run pip self repair', 'Try a conservative upgrade based on pip check output.'),
            commandAction('pip-check', 'Run pip check', 'pip', ['check'], 'Re-run pip dependency validation.'),
            copyAction('pip-conflict-note', 'Copy fix notes', [
              'pip check',
              `pip install --upgrade "${dependency}"`,
              'Then update requirements.txt with the resolved version.'
            ].join('\n'))
          ]
        }))
        continue
      }

      issues.push(createIssue({
        type: 'configuration',
        severity: 'medium',
        title: 'pip dependency warning',
        description: line,
        suggestion: 'Run pip check again after upgrading or reinstalling the package mentioned in the warning.',
        actions: [
          apiAction('pip-repair-check', 'Run pip self repair', 'Try the built-in repair flow.'),
          commandAction('pip-check', 'Run pip check', 'pip', ['check'])
        ]
      }))
    }

    return { issues: uniqueIssues(issues), raw }
  }

  private async scanMaven(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const output = await runToolCapture('maven', ['dependency:tree', '-Dverbose'], cwd, 'mvn')
    const raw = [output.stdout, output.stderr].filter(Boolean).join('\n')
    const deps = parseMavenDependencies(raw)
    const issues: DependencyHealthIssue[] = []
    const versions = new Map<string, Map<string, string[]>>()
    const pomPath = join(cwd, 'pom.xml')
    const buildFileActions = [
      openFileAction(pomPath),
      commandAction('maven-tree-verbose', 'Show dependency tree', 'maven', ['dependency:tree', '-Dverbose'], 'Run Maven dependency tree with conflict details.', 'mvn')
    ]

    collectMavenVersions(deps, versions)
    detectMavenCycles(deps, createIssue, issues, buildFileActions)

    for (const dep of deps.filter((item) => item.conflictWith && item.conflictWith !== item.version)) {
      issues.push(createIssue({
        type: 'version-conflict',
        severity: 'medium',
        dependency: mavenKey(dep),
        title: 'Maven conflict mediation',
        description: `${mavenKey(dep)} requests ${dep.version}, but Maven resolved a conflict with ${dep.conflictWith}.`,
        suggestion: 'Use dependencyManagement to choose the intended version, or upgrade the direct dependency that brings the older transitive version.',
        actions: [
          ...buildFileActions,
          copyAction('maven-dependency-management', 'Copy dependencyManagement snippet', mavenDependencyManagementSnippet(dep, dep.conflictWith || dep.version))
        ]
      }))
    }

    const declared = parsePomDependencies(await readFileSafe(pomPath))
    for (const issue of duplicateDeclaredMavenDependencies(declared, createIssue, buildFileActions)) {
      issues.push(issue)
    }

    for (const [key, versionPaths] of versions) {
      if (versionPaths.size <= 1) continue
      const versionList = [...versionPaths.keys()].filter(Boolean)
      if (versionList.length <= 1) continue
      const [groupId, artifactId] = key.split(':')
      issues.push(createIssue({
        type: 'version-conflict',
        severity: 'medium',
        dependency: key,
        title: 'Maven multi-version dependency',
        description: `${key} appears with ${versionList.join(', ')} in the resolved dependency tree.`,
        suggestion: 'Pin one version in dependencyManagement, then confirm with mvn dependency:tree -Dverbose.',
        paths: [...versionPaths.values()].flat().slice(0, 8),
        actions: [
          ...buildFileActions,
          copyAction('maven-management-snippet', 'Copy dependencyManagement snippet', mavenDependencyManagementSnippet({ groupId, artifactId }, versionList[0]))
        ]
      }))
    }

    return { issues: uniqueIssues(issues), raw }
  }

  private async scanGradle(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    let output = await runToolCapture('gradle', ['dependencies', '--configuration', 'runtimeClasspath'], cwd, 'gradle')
    if (!output.stdout.trim() || /configuration .* not found/i.test(output.stderr)) {
      output = await runToolCapture('gradle', ['dependencies'], cwd, 'gradle')
    }

    const raw = [output.stdout, output.stderr].filter(Boolean).join('\n')
    const lines = parseGradleDependencyLines(raw)
    const versions = new Map<string, Map<string, string[]>>()
    const issues: DependencyHealthIssue[] = []
    const buildPath = await findGradleBuildFile(cwd)

    for (const line of lines) {
      const key = `${line.groupId}:${line.artifactId}`
      addVersionPath(versions, key, line.requested, key)
      if (line.selected) {
        addVersionPath(versions, key, line.selected, key)
        if (line.selected !== line.requested) {
          issues.push(createIssue({
            type: 'version-conflict',
            severity: 'medium',
            dependency: key,
            title: 'Gradle selected a different version',
            description: `${key} requested ${line.requested}, but Gradle selected ${line.selected}.`,
            suggestion: 'Inspect dependencyInsight, then align the direct dependency or add a constraints/resolution strategy entry.',
            actions: [
              commandAction('gradle-insight', 'Run dependencyInsight', 'gradle', ['dependencyInsight', '--dependency', line.artifactId, '--configuration', 'runtimeClasspath'], 'Show the paths and selection reason for this dependency.'),
              openFileAction(buildPath),
              copyAction('gradle-resolution-snippet', 'Copy resolutionStrategy snippet', gradleResolutionSnippet(key, line.selected))
            ]
          }))
        }
      }
    }

    for (const [key, versionPaths] of versions) {
      if (versionPaths.size <= 1) continue
      const versionList = [...versionPaths.keys()]
      const artifactId = key.split(':')[1] || key
      issues.push(createIssue({
        type: 'version-conflict',
        severity: 'medium',
        dependency: key,
        title: 'Gradle multi-version request',
        description: `${key} is requested as ${versionList.join(', ')} in the dependency graph.`,
        suggestion: 'Use dependencyInsight and then prefer dependency constraints over broad force rules when possible.',
        paths: [...versionPaths.values()].flat().slice(0, 8),
        actions: [
          commandAction('gradle-insight', 'Run dependencyInsight', 'gradle', ['dependencyInsight', '--dependency', artifactId, '--configuration', 'runtimeClasspath']),
          openFileAction(buildPath),
          copyAction('gradle-constraint-note', 'Copy constraints example', gradleConstraintSnippet(key, versionList[versionList.length - 1]))
        ]
      }))
    }

    return { issues: uniqueIssues(issues), raw }
  }

  private async scanCargo(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const output = await runToolCapture('cargo', ['tree', '-d'], cwd)
    const raw = [output.stdout, output.stderr].filter(Boolean).join('\n')
    if (!raw.trim() || /nothing to print/i.test(raw)) {
      return { issues: [], raw }
    }

    const crates = [...raw.matchAll(/^([A-Za-z0-9_-]+)\s+v([^\s]+)/gm)]
    const names = new Map<string, Set<string>>()
    for (const match of crates) {
      const versions = names.get(match[1]) || new Set<string>()
      versions.add(match[2])
      names.set(match[1], versions)
    }

    const issues = [...names.entries()]
      .filter(([, versions]) => versions.size > 1)
      .map(([name, versions]) => createIssue({
        type: 'version-conflict',
        severity: 'medium',
        dependency: name,
        title: 'Cargo duplicate crate versions',
        description: `${name} appears as ${[...versions].join(', ')} in cargo tree -d.`,
        suggestion: 'Run cargo update first. If duplicates remain, align the dependency ranges in Cargo.toml.',
        actions: [
          commandAction('cargo-update-package', 'Run cargo update -p', 'cargo', ['update', '-p', name]),
          commandAction('cargo-tree-duplicates', 'Show duplicates', 'cargo', ['tree', '-d']),
          openFileAction(join(cwd, 'Cargo.toml'))
        ]
      }))

    return { issues, raw }
  }

  private async scanGo(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const output = await runToolCapture('go', ['mod', 'graph'], cwd)
    const raw = [output.stdout, output.stderr].filter(Boolean).join('\n')
    const versions = new Map<string, Set<string>>()

    for (const token of raw.split(/\s+/)) {
      const parsed = parseGoModuleToken(token)
      if (!parsed) continue
      const item = versions.get(parsed.path) || new Set<string>()
      item.add(parsed.version)
      versions.set(parsed.path, item)
    }

    const issues = [...versions.entries()]
      .filter(([, item]) => item.size > 1)
      .map(([modulePath, item]) => createIssue({
        type: 'version-conflict',
        severity: 'low',
        dependency: modulePath,
        title: 'Go module graph references multiple versions',
        description: `${modulePath} appears as ${[...item].join(', ')} in go mod graph.`,
        suggestion: 'Go will select one build-list version, but go mod tidy or an explicit go get can reduce noisy version edges.',
        actions: [
          commandAction('go-mod-tidy', 'Run go mod tidy', 'go', ['mod', 'tidy']),
          copyAction('go-get-latest', 'Copy go get command', `go get ${modulePath}@latest`),
          openFileAction(join(cwd, 'go.mod'))
        ]
      }))

    return { issues, raw }
  }

  private async scanNative(cwd: string, createIssue: IssueFactory): Promise<{ issues: DependencyHealthIssue[]; raw: string }> {
    const dependencies = await this.nativeService.list(cwd)
    const issues: DependencyHealthIssue[] = []
    const byName = new Map<string, NativeDependencyInfo[]>()

    for (const dep of dependencies) {
      const key = normalizeNativeName(dep.name)
      if (!key) continue
      byName.set(key, [...(byName.get(key) || []), dep])
    }

    for (const [key, items] of byName) {
      const versions = new Set(items.map((item) => item.version).filter(Boolean) as string[])
      const managers = new Set(items.map((item) => item.manager))
      const linkages = new Set(items.map((item) => item.linkage).filter(Boolean) as string[])
      const displayName = items[0]?.name || key

      if (versions.size > 1) {
        issues.push(createIssue({
          type: 'version-conflict',
          severity: 'medium',
          dependency: displayName,
          title: 'Native library has multiple versions',
          description: `${displayName} is referenced as ${[...versions].join(', ')}.`,
          suggestion: 'Keep one version across vcpkg, Conan, CMake presets and checked-in binary libraries.',
          paths: items.map(nativeIssuePath).filter(Boolean).slice(0, 8),
          actions: nativeManifestActions(cwd)
        }))
      }

      if (linkages.has('dynamic') && linkages.has('static')) {
        issues.push(createIssue({
          type: 'native-linkage',
          severity: 'medium',
          dependency: displayName,
          title: 'Native library mixes dynamic and static linkage',
          description: `${displayName} appears with both dynamic and static linkage.`,
          suggestion: 'Choose one linkage mode for the target and align CMake/vcpkg/Conan configuration.',
          paths: items.map(nativeIssuePath).filter(Boolean).slice(0, 8),
          actions: [
            commandAction('cmake-configure', 'Run CMake configure', 'cmake', ['-S', '.', '-B', 'build']),
            ...nativeManifestActions(cwd)
          ]
        }))
      }

      if (managers.has('cmake') && !managers.has('vcpkg') && !managers.has('conan')) {
        issues.push(createIssue({
          type: 'unmanaged',
          severity: 'low',
          dependency: displayName,
          title: 'CMake dependency is not declared in a package manifest',
          description: `${displayName} is referenced by CMake but was not found in vcpkg.json or conanfile.`,
          suggestion: 'Declare it in vcpkg.json or conanfile.txt so setup is reproducible.',
          paths: items.map(nativeIssuePath).filter(Boolean).slice(0, 8),
          actions: nativeManifestActions(cwd)
        }))
      }
    }

    return { issues: uniqueIssues(issues), raw: JSON.stringify(dependencies, null, 2) }
  }
}

async function runToolCapture(tool: ToolName, args: string[], cwd: string, displayBin = displayName(tool)): Promise<{ stdout: string; stderr: string }> {
  const bin = tool === 'gradle'
    ? await resolveGradleBin(cwd)
    : await resolveToolBin(tool, cwd)

  try {
    return await runLoggedCommand(bin, args, {
      cwd,
      maxBuffer: 1024 * 1024 * 30,
      displayBin
    })
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || ''
    }
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

function parseJson<T>(value: string, fallback: T): T {
  if (!value.trim()) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    const extracted = extractJson(value)
    if (!extracted) return fallback
    try {
      return JSON.parse(extracted) as T
    } catch {
      return fallback
    }
  }
}

function extractJson(value: string): string {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) return ''
  return value.slice(start, end + 1)
}

function walkNpmTree(
  node: NpmTreeNode,
  context: {
    path: string[]
    versions: Map<string, Map<string, string[]>>
    onCycle: (dependency: string, cyclePath: string[]) => void
    onProblem: (problem: string, dependency?: string) => void
  }
): void {
  for (const [depName, child] of Object.entries(node.dependencies || {})) {
    const name = child.name || depName
    const version = child.version || 'unknown'
    const nextPath = [...context.path, `${name}@${version}`]
    addVersionPath(context.versions, name, version, nextPath.join(' > '))

    if (context.path.some((item) => item.replace(/@[^@]*$/, '') === name)) {
      context.onCycle(name, nextPath)
      continue
    }

    for (const problem of child.problems || []) {
      context.onProblem(problem, name)
    }
    if (child.invalid) context.onProblem(`invalid: ${name}@${version}`, name)
    if (child.missing) context.onProblem(`missing: ${name}@${version}`, name)
    if (child.extraneous) context.onProblem(`extraneous: ${name}@${version}`, name)

    walkNpmTree(child, { ...context, path: nextPath })
  }
}

function npmProblemToIssue(problem: string, dependency: string | undefined, cwd: string): Omit<DependencyHealthIssue, 'id' | 'manager'> {
  const normalized = problem.toLowerCase()
  const dep = dependency || dependencyFromProblem(problem)
  const packageJson = join(cwd, 'package.json')

  if (normalized.includes('peer') || normalized.includes('eresolve')) {
    return {
      type: 'peer-conflict',
      severity: 'high',
      dependency: dep,
      title: 'npm peer dependency conflict',
      description: problem,
      suggestion: 'Install with compatible peer versions. Use --legacy-peer-deps only as a short-term unblocker.',
      actions: [
        commandAction('npm-install-legacy-peer-deps', 'Run npm install', 'npm', ['install', '--legacy-peer-deps']),
        dep ? commandAction('npm-explain-peer', 'Explain dependency', 'npm', ['explain', dep]) : commandAction('npm-ls', 'Show npm tree', 'npm', ['ls', '--all']),
        openFileAction(packageJson)
      ]
    }
  }

  if (normalized.includes('missing')) {
    return {
      type: 'missing',
      severity: 'high',
      dependency: dep,
      title: 'Missing npm dependency',
      description: problem,
      suggestion: 'Run npm install to restore the missing package, then verify package.json and lock file.',
      actions: [
        commandAction('npm-install', 'Run npm install', 'npm', ['install', '--legacy-peer-deps']),
        openFileAction(packageJson)
      ]
    }
  }

  if (normalized.includes('invalid')) {
    return {
      type: 'invalid',
      severity: 'high',
      dependency: dep,
      title: 'Invalid npm dependency',
      description: problem,
      suggestion: 'Reinstall the dependency or align the requested version range in package.json.',
      actions: [
        dep ? commandAction('npm-explain-invalid', 'Explain dependency', 'npm', ['explain', dep]) : commandAction('npm-ls-invalid', 'Show npm tree', 'npm', ['ls', '--all']),
        commandAction('npm-install', 'Run npm install', 'npm', ['install', '--legacy-peer-deps']),
        openFileAction(packageJson)
      ]
    }
  }

  if (normalized.includes('extraneous')) {
    return {
      type: 'extraneous',
      severity: 'low',
      dependency: dep,
      title: 'Extraneous npm dependency',
      description: problem,
      suggestion: 'Remove packages that are installed but not declared by running npm prune.',
      actions: [
        commandAction('npm-prune', 'Run npm prune', 'npm', ['prune']),
        openFileAction(packageJson)
      ]
    }
  }

  return {
    type: 'configuration',
    severity: 'medium',
    dependency: dep,
    title: 'npm dependency problem',
    description: problem,
    suggestion: 'Inspect npm ls output and align direct dependencies or lock file state.',
    actions: [
      commandAction('npm-ls-all', 'Show npm tree', 'npm', ['ls', '--all']),
      openFileAction(packageJson)
    ]
  }
}

function dependencyFromProblem(problem: string): string | undefined {
  const match = problem.match(/(?:missing|invalid|extraneous|peer dep missing):\s+(@?[^@\s,]+(?:\/[^@\s,]+)?)/i)
    || problem.match(/\b(@?[\w.-]+\/[\w.-]+|[\w.-]+)@[\w*.^~<>=-]+/)
  return match?.[1]
}

function parseMavenDependencies(raw: string): MavenLineDependency[] {
  const result: MavenLineDependency[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.replace(/^\[INFO\]\s?/, '').trimEnd()
    if (!line.includes(':')) continue
    const parsed = parseMavenDependencyLine(line)
    if (parsed) result.push(parsed)
  }
  return result
}

function parseMavenDependencyLine(line: string): MavenLineDependency | null {
  const markerIndex = line.search(/(?:\+-|\\-)\s/)
  const dependencyText = markerIndex >= 0 ? line.slice(markerIndex + 3).trim() : line.trim()
  const prefix = markerIndex >= 0 ? line.slice(0, markerIndex) : ''
  const depth = markerIndex >= 0 ? Math.max(1, Math.floor(prefix.length / 3) + 1) : 0
  const conflictWith = dependencyText.match(/omitted for conflict with\s+([A-Za-z0-9_.+-]+)/i)?.[1]
  const cleanText = dependencyText.replace(/\s+\(.+\)$/, '')
  const parts = cleanText.split(':').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 4) return null

  return {
    groupId: parts[0],
    artifactId: parts[1],
    version: parts.length >= 5 ? parts[parts.length - 2] : parts[3],
    depth,
    conflictWith
  }
}

function collectMavenVersions(deps: MavenLineDependency[], versions: Map<string, Map<string, string[]>>): void {
  for (const dep of deps) {
    const key = mavenKey(dep)
    addVersionPath(versions, key, dep.version, key)
    if (dep.conflictWith) addVersionPath(versions, key, dep.conflictWith, `${key} conflict target`)
  }
}

function detectMavenCycles(
  deps: MavenLineDependency[],
  createIssue: IssueFactory,
  issues: DependencyHealthIssue[],
  actions: DependencyHealthAction[]
): void {
  const stack: MavenLineDependency[] = []
  const reported = new Set<string>()

  for (const dep of deps) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= dep.depth) {
      stack.pop()
    }
    const key = mavenKey(dep)
    const index = stack.findIndex((item) => mavenKey(item) === key)
    if (index >= 0 && !reported.has(key)) {
      reported.add(key)
      issues.push(createIssue({
        type: 'cycle',
        severity: 'high',
        dependency: key,
        title: 'Maven circular dependency path detected',
        description: `${key} appears again under its own dependency path.`,
        suggestion: 'Upgrade or exclude one of the dependencies in the repeated path.',
        paths: [[...stack.slice(index).map(mavenKey), key].join(' > ')],
        actions
      }))
    }
    stack.push(dep)
  }
}

function parsePomDependencies(content: string): Array<{ groupId: string; artifactId: string; version: string }> {
  const dependencies: Array<{ groupId: string; artifactId: string; version: string }> = []
  for (const block of content.match(/<dependency>[\s\S]*?<\/dependency>/g) || []) {
    const groupId = readXmlTag(block, 'groupId')
    const artifactId = readXmlTag(block, 'artifactId')
    if (!groupId || !artifactId) continue
    dependencies.push({ groupId, artifactId, version: readXmlTag(block, 'version') || 'inherited' })
  }
  return dependencies
}

function duplicateDeclaredMavenDependencies(
  deps: Array<{ groupId: string; artifactId: string; version: string }>,
  createIssue: IssueFactory,
  actions: DependencyHealthAction[]
): DependencyHealthIssue[] {
  const byKey = new Map<string, Set<string>>()
  for (const dep of deps) {
    const key = `${dep.groupId}:${dep.artifactId}`
    const versions = byKey.get(key) || new Set<string>()
    versions.add(dep.version)
    byKey.set(key, versions)
  }

  return [...byKey.entries()]
    .filter(([, versions]) => versions.size > 1)
    .map(([key, versions]) => createIssue({
      type: 'version-conflict',
      severity: 'high',
      dependency: key,
      title: 'Duplicate Maven declarations',
      description: `${key} is declared multiple times in pom.xml with ${[...versions].join(', ')}.`,
      suggestion: 'Keep one direct declaration and move shared version control into dependencyManagement.',
      actions
    }))
}

function parseGradleDependencyLines(raw: string): GradleDependencyLine[] {
  const result: GradleDependencyLine[] = []
  const coordinate = /([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([^\s()]+)(?:\s*->\s*([^\s()]+))?/

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(coordinate)
    if (!match) continue
    result.push({
      groupId: match[1],
      artifactId: match[2],
      requested: cleanGradleVersion(match[3]),
      selected: match[4] ? cleanGradleVersion(match[4]) : undefined
    })
  }

  return result
}

function cleanGradleVersion(value: string): string {
  return value.replace(/[,*]+$/, '').trim()
}

async function findGradleBuildFile(cwd: string): Promise<string> {
  for (const fileName of ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle']) {
    const filePath = join(cwd, fileName)
    if (await fileExists(filePath)) return filePath
  }
  return join(cwd, 'build.gradle')
}

function parseGoModuleToken(token: string): { path: string; version: string } | null {
  const at = token.lastIndexOf('@')
  if (at <= 0 || at === token.length - 1) return null
  return {
    path: token.slice(0, at),
    version: token.slice(at + 1)
  }
}

function nativeManifestActions(cwd: string): DependencyHealthAction[] {
  return [
    openFileAction(join(cwd, 'CMakeLists.txt')),
    openFileAction(join(cwd, 'vcpkg.json')),
    openFileAction(join(cwd, 'conanfile.txt')),
    copyAction('native-fix-note', 'Copy native fix notes', [
      'Pick one package manager for the library when possible.',
      'Keep CMake target_link_libraries aligned with vcpkg.json or conanfile.txt.',
      'Re-run cmake -S . -B build after changing linkage or versions.'
    ].join('\n'))
  ]
}

function nativeIssuePath(dep: NativeDependencyInfo): string {
  return dep.path || dep.source || dep.manager
}

function normalizeNativeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^lib/, '')
    .replace(/\.(dll|so|dylib|a|lib)$/i, '')
    .replace(/::/g, '-')
    .replace(/[^a-z0-9_.+-]+/g, '-')
}

function addVersionPath(map: Map<string, Map<string, string[]>>, dependency: string, version: string, path: string): void {
  if (!dependency || !version) return
  const versions = map.get(dependency) || new Map<string, string[]>()
  versions.set(version, [...(versions.get(version) || []), path])
  map.set(dependency, versions)
}

function mavenKey(dep: Pick<MavenLineDependency, 'groupId' | 'artifactId'>): string {
  return `${dep.groupId}:${dep.artifactId}`
}

function readXmlTag(content: string, tag: string): string {
  return content.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`))?.[1]?.trim() || ''
}

function mavenDependencyManagementSnippet(dep: Pick<MavenLineDependency, 'groupId' | 'artifactId'>, version: string): string {
  return [
    '<dependencyManagement>',
    '  <dependencies>',
    '    <dependency>',
    `      <groupId>${dep.groupId}</groupId>`,
    `      <artifactId>${dep.artifactId}</artifactId>`,
    `      <version>${version}</version>`,
    '    </dependency>',
    '  </dependencies>',
    '</dependencyManagement>'
  ].join('\n')
}

function gradleResolutionSnippet(coordinate: string, version: string): string {
  return [
    'configurations.all {',
    '    resolutionStrategy {',
    `        force '${coordinate}:${version}'`,
    '    }',
    '}'
  ].join('\n')
}

function gradleConstraintSnippet(coordinate: string, version: string): string {
  return [
    'dependencies {',
    '    constraints {',
    `        implementation('${coordinate}:${version}') {`,
    "            because 'Align transitive dependency versions'",
    '        }',
    '    }',
    '}'
  ].join('\n')
}

function commandAction(
  id: string,
  label: string,
  tool: ToolName,
  args: string[],
  description?: string,
  displayBin?: string
): DependencyHealthAction {
  return {
    id,
    label,
    kind: 'command',
    description,
    command: { tool, args, displayBin }
  }
}

function apiAction(id: string, label: string, description?: string): DependencyHealthAction {
  return { id, label, kind: 'api', description }
}

function openFileAction(target: string): DependencyHealthAction {
  return {
    id: `open-${slug(target)}`,
    label: 'Open file',
    kind: 'openFile',
    target
  }
}

function openFolderAction(target: string): DependencyHealthAction {
  return {
    id: `open-folder-${slug(target)}`,
    label: 'Open folder',
    kind: 'openFile',
    target
  }
}

function copyAction(id: string, label: string, payload: string): DependencyHealthAction {
  return {
    id,
    label,
    kind: 'copy',
    payload
  }
}

function displayName(tool: ToolName): string {
  if (tool === 'maven') return 'mvn'
  return tool
}

function summarizeIssues(issues: DependencyHealthIssue[]): DependencyHealthSummary {
  return {
    total: issues.length,
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    high: issues.filter((issue) => issue.severity === 'high').length,
    medium: issues.filter((issue) => issue.severity === 'medium').length,
    low: issues.filter((issue) => issue.severity === 'low').length,
    info: issues.filter((issue) => issue.severity === 'info').length
  }
}

function uniqueIssues(issues: DependencyHealthIssue[]): DependencyHealthIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.type}:${issue.dependency || ''}:${issue.description}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function readFileSafe(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item'
}
