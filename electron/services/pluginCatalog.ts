import { app } from 'electron'
import { access, mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { checkTools, ToolName } from './toolchain'

export type PackageManagerId = 'npm' | 'pip' | 'maven' | 'cargo' | 'gradle' | 'go' | 'native'

export interface PackageManagerPlugin {
  id: PackageManagerId
  name: string
  language: string
  packageManager: string
  tools: ToolName[]
  manifestFiles: string[]
  lockFiles: string[]
  capabilities: string[]
  scenarios: string[]
  builtIn: boolean
  enabled: boolean
  detected: boolean
  available: boolean
  version?: string
  configuredPath?: string
  message?: string
}

interface PluginState {
  disabled: PackageManagerId[]
}

const PLUGIN_DEFINITIONS: Array<Omit<PackageManagerPlugin, 'enabled' | 'detected' | 'available'>> = [
  {
    id: 'npm',
    name: 'npm / Node.js',
    language: 'JavaScript / TypeScript',
    packageManager: 'npm',
    tools: ['npm'],
    manifestFiles: ['package.json'],
    lockFiles: ['package-lock.json', 'npm-shrinkwrap.json'],
    capabilities: ['project dependencies', 'global packages', 'search', 'audit', 'publish', 'scripts'],
    scenarios: ['frontend', 'Node.js services', 'Electron', 'tooling'],
    builtIn: true
  },
  {
    id: 'pip',
    name: 'pip / Python',
    language: 'Python',
    packageManager: 'pip',
    tools: ['pip'],
    manifestFiles: ['requirements.txt', 'pyproject.toml', 'setup.py'],
    lockFiles: ['requirements.lock', 'poetry.lock', 'uv.lock'],
    capabilities: ['environment packages', 'requirements', 'indexes', 'audit', 'publish'],
    scenarios: ['backend', 'AI/ML', 'automation', 'data science'],
    builtIn: true
  },
  {
    id: 'maven',
    name: 'Maven',
    language: 'Java / JVM',
    packageManager: 'Maven',
    tools: ['maven'],
    manifestFiles: ['pom.xml'],
    lockFiles: [],
    capabilities: ['dependencies', 'goals', 'repositories', 'audit', 'deploy'],
    scenarios: ['Java services', 'Spring', 'enterprise backend'],
    builtIn: true
  },
  {
    id: 'cargo',
    name: 'Cargo',
    language: 'Rust',
    packageManager: 'Cargo',
    tools: ['cargo'],
    manifestFiles: ['Cargo.toml'],
    lockFiles: ['Cargo.lock'],
    capabilities: ['dependencies', 'features', 'tree', 'audit', 'commands'],
    scenarios: ['systems', 'CLI', 'WebAssembly', 'services'],
    builtIn: true
  },
  {
    id: 'gradle',
    name: 'Gradle',
    language: 'Java / Kotlin / Android',
    packageManager: 'Gradle',
    tools: ['gradle'],
    manifestFiles: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    lockFiles: ['gradle.lockfile'],
    capabilities: ['dependencies', 'tasks', 'repositories', 'dependency insight'],
    scenarios: ['Android', 'Kotlin', 'JVM monorepos'],
    builtIn: true
  },
  {
    id: 'go',
    name: 'Go Modules',
    language: 'Go',
    packageManager: 'go',
    tools: ['go'],
    manifestFiles: ['go.mod'],
    lockFiles: ['go.sum'],
    capabilities: ['modules', 'versions', 'tidy', 'graph', 'vulnerability scan'],
    scenarios: ['cloud services', 'CLI', 'microservices'],
    builtIn: true
  },
  {
    id: 'native',
    name: 'C/C++ Native',
    language: 'C / C++',
    packageManager: 'CMake / vcpkg / Conan',
    tools: ['cmake', 'vcpkg', 'conan'],
    manifestFiles: ['CMakeLists.txt', 'vcpkg.json', 'conanfile.txt', 'conanfile.py'],
    lockFiles: ['vcpkg-lock.json', 'conan.lock'],
    capabilities: ['native dependencies', 'dynamic libraries', 'static libraries', 'CMake build', 'vcpkg', 'Conan'],
    scenarios: ['systems', 'desktop native', 'game engines', 'embedded', 'shared libraries'],
    builtIn: true
  }
]

export class PluginCatalogService {
  async catalog(projectPath?: string): Promise<PackageManagerPlugin[]> {
    const [globalState, projectState, statuses] = await Promise.all([
      readState(globalStatePath()),
      projectPath ? readState(projectStatePath(projectPath)) : Promise.resolve({ disabled: [] }),
      checkTools(projectPath)
    ])

    const disabled = new Set<PackageManagerId>([...globalState.disabled, ...projectState.disabled])
    const statusMap = new Map(statuses.map((status) => [status.tool, status]))

    return await Promise.all(PLUGIN_DEFINITIONS.map(async (definition) => {
      const toolStatuses = definition.tools.map((tool) => statusMap.get(tool)).filter(Boolean)
      const primaryStatus = toolStatuses[0]
      const available = definition.id === 'native'
        ? toolStatuses.some((status) => status?.available)
        : definition.tools.every((tool) => statusMap.get(tool)?.available)
      return {
        ...definition,
        enabled: !disabled.has(definition.id),
        detected: projectPath ? await this.isDetected(definition.id, projectPath) : false,
        available,
        version: primaryStatus?.version,
        configuredPath: primaryStatus?.configuredPath,
        message: primaryStatus?.message
      }
    }))
  }

  async setEnabled(id: PackageManagerId, enabled: boolean, projectPath?: string): Promise<PackageManagerPlugin[]> {
    const targetPath = projectPath ? projectStatePath(projectPath) : globalStatePath()
    const state = await readState(targetPath)
    const disabled = new Set(state.disabled)

    if (enabled) {
      disabled.delete(id)
    } else {
      disabled.add(id)
    }

    await writeState(targetPath, { disabled: [...disabled] })
    return await this.catalog(projectPath)
  }

  async detected(projectPath: string): Promise<PackageManagerId[]> {
    const detected: PackageManagerId[] = []
    for (const definition of PLUGIN_DEFINITIONS) {
      if (await this.isDetected(definition.id, projectPath)) {
        detected.push(definition.id)
      }
    }
    return detected
  }

  private async isDetected(id: PackageManagerId, projectPath: string): Promise<boolean> {
    const definition = PLUGIN_DEFINITIONS.find((item) => item.id === id)
    if (!definition) return false
    for (const manifest of definition.manifestFiles) {
      try {
        await access(join(projectPath, manifest))
        return true
      } catch {
      }
    }
    return false
  }
}

function globalStatePath(): string {
  return join(app.getPath('userData'), 'plugin-components.json')
}

function projectStatePath(projectPath: string): string {
  return join(projectPath, '.npmDesktopManager', 'plugin-components.json')
}

async function readState(filePath: string): Promise<PluginState> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf-8'))
    return {
      disabled: Array.isArray(parsed.disabled) ? parsed.disabled : []
    }
  } catch {
    return { disabled: [] }
  }
}

async function writeState(filePath: string, state: PluginState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')
}
