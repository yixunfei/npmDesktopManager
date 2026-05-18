declare global {
  interface Window {
    electronAPI: {
      app: {
        getStartupLanguage: () => Promise<StartupLanguageInfo>
        setMenuLanguage: (language: AppLanguage) => Promise<void>
      }

      getDefaultPath: () => Promise<string>
      selectDirectory: () => Promise<string | null>
      
      npm: {
        search: (query: string, limit?: number) => Promise<any[]>
        view: (packageName: string) => Promise<any>
        install: (args: InstallArgs) => Promise<string>
        uninstall: (args: UninstallArgs) => Promise<string>
        update: (args: UpdateArgs) => Promise<string>
        outdated: (cwd: string) => Promise<any>
        list: (cwd: string, global: boolean) => Promise<any>
        configList: () => Promise<any>
        configSet: (key: string, value: string) => Promise<void>
        configGet: (key: string) => Promise<string>
        configDelete: (key: string) => Promise<void>
        configEdit: () => Promise<void>
        whoami: () => Promise<string>
        login: (registry?: string) => Promise<void>
        logout: (registry?: string) => Promise<void>
        runScript: (cwd: string, script: string) => Promise<string>
        getScripts: (cwd: string) => Promise<string[]>
        moveDep: (args: MoveDepArgs) => Promise<string>
        getPublished: (username: string) => Promise<any[]>
        checkAllOutdated: (cwd: string) => Promise<any>
        getPackageInfo: (packageName: string) => Promise<any>
        getVersions: (packageName: string) => Promise<string[]>
        getVersionMetadata: (packageName: string) => Promise<NpmVersionMetadata>
        installVersion: (args: InstallVersionArgs) => Promise<string>
        globalOutdated: () => Promise<any>
        adduser: (registry?: string) => Promise<void>
        getRegistryInfo: (registry?: string) => Promise<any>
        getPackageSize: (packageName: string, version?: string) => Promise<PackageSizeInfo>
        getDependencyTree: (packageName: string, version?: string, depth?: number) => Promise<DependencyTreeNode>
        audit: (cwd: string) => Promise<AuditResult>
        globalAudit: () => Promise<AuditResult>
        auditFix: (cwd: string) => Promise<string>
        getReadme: (packageName: string) => Promise<string>
        getDependents: (packageName: string) => Promise<number>
        downloadStats: (packageName: string) => Promise<DownloadStats>
        getProjectDependencyTree: (cwd: string, depth?: number) => Promise<any>
        getGlobalDependencyTree: (depth?: number) => Promise<any>
      }

      pip: {
        list: (options?: string | PipCommandOptions) => Promise<PipPackageInfo[]>
        outdated: (options?: string | PipCommandOptions) => Promise<PipPackageInfo[]>
        install: (args: PipInstallArgs) => Promise<string>
        uninstall: (args: PipPackageArgs) => Promise<string>
        update: (args: PipPackageArgs) => Promise<string>
        updateAll: (args?: PipCommandOptions) => Promise<{ success: number; failed: number; output: string }>
        freeze: (cwd?: string) => Promise<string>
        exportRequirements: (cwd: string) => Promise<void>
        readRequirements: (cwd: string) => Promise<string[]>
        search: (query: string, cwd?: string) => Promise<PipSearchResult[]>
        versions: (packageName: string) => Promise<string[]>
        show: (packageName: string, cwd?: string) => Promise<PipPackageDetail | null>
        check: (cwd?: string) => Promise<string>
        repairCheck: (cwd?: string) => Promise<PipRepairResult>
        configList: (scope?: PipConfigScope) => Promise<PipConfigItem[]>
        configFile: (scope?: PipConfigScope) => Promise<string>
        backupConfig: (scope?: PipConfigScope) => Promise<string>
        configSet: (scope: PipConfigScope, key: string, value: string) => Promise<void>
        configUnset: (scope: PipConfigScope, key: string) => Promise<void>
        cacheDir: () => Promise<string>
        cachePurge: () => Promise<string>
        audit: (cwd?: string) => Promise<{ issues: PipAuditIssue[]; raw: string; error?: string }>
        installTool: (tool: 'pip-audit' | 'pipdeptree', cwd?: string) => Promise<string>
        dependencyTree: (cwd?: string) => Promise<PipDependencyTreeNode[]>
        publish: (args: PipPublishArgs) => Promise<string>
      }

      maven: {
        detect: (cwd: string) => Promise<{ hasPom: boolean; path: string }>
        list: (cwd: string) => Promise<MavenDependencyInfo[]>
        tree: (cwd: string) => Promise<string>
        dependencyTree: (cwd: string) => Promise<MavenDependencyTreeNode | null>
        runGoal: (cwd: string, goal: string) => Promise<string>
        search: (query: string, cwd?: string, options?: MavenSearchOptions) => Promise<MavenSearchResult[]>
        versions: (groupId: string, artifactId: string) => Promise<string[]>
        info: (cwd?: string) => Promise<MavenGlobalInfo>
        effectiveSettings: (cwd?: string) => Promise<string>
        ensureSettings: () => Promise<string>
        backupSettings: () => Promise<string>
        setLocalRepository: (repositoryPath: string) => Promise<void>
        setMirror: (id: string, url: string, mirrorOf?: string) => Promise<void>
        setServer: (id: string, username: string, password: string) => Promise<void>
        deploy: (args: MavenDeployArgs) => Promise<string>
        securityAudit: (cwd: string) => Promise<{ issues: MavenAuditIssue[]; reportPath: string; raw?: string; error?: string }>
        goOffline: (cwd: string) => Promise<string>
        purgeLocalRepository: (cwd: string) => Promise<string>
        addDependency: (cwd: string, dep: MavenDependencyInfo) => Promise<void>
        removeDependency: (cwd: string, dep: Pick<MavenDependencyInfo, 'groupId' | 'artifactId'>) => Promise<void>
      }

      plugins: {
        catalog: (projectPath?: string) => Promise<PackageManagerPlugin[]>
        setEnabled: (id: PackageManagerId, enabled: boolean, projectPath?: string) => Promise<PackageManagerPlugin[]>
        detected: (projectPath: string) => Promise<PackageManagerId[]>
      }

      cargo: {
        detect: (cwd: string) => Promise<{ hasCargoToml: boolean; path: string }>
        list: (cwd: string) => Promise<CargoDependencyInfo[]>
        search: (query: string) => Promise<CargoSearchResult[]>
        versions: (packageName: string) => Promise<string[]>
        install: (args: CargoInstallArgs) => Promise<string>
        uninstall: (args: CargoPackageArgs) => Promise<string>
        update: (args: { packageName?: string; cwd: string }) => Promise<string>
        tree: (cwd: string) => Promise<string>
        audit: (cwd: string) => Promise<{ raw: string; error?: string }>
        run: (cwd: string, commandLine: string) => Promise<string>
      }

      gradle: {
        detect: (cwd: string) => Promise<{ hasGradleBuild: boolean; path: string }>
        list: (cwd: string) => Promise<GradleDependencyInfo[]>
        search: (query: string, options?: MavenSearchOptions) => Promise<GradleSearchResult[]>
        versions: (groupId: string, artifactId: string) => Promise<string[]>
        addDependency: (args: GradleDependencyArgs) => Promise<void>
        updateDependency: (args: GradleDependencyArgs) => Promise<void>
        removeDependency: (args: GradleRemoveDependencyArgs) => Promise<void>
        runTask: (cwd: string, taskLine: string) => Promise<string>
        tasks: (cwd: string) => Promise<string>
        dependencyTree: (cwd: string, configuration?: string) => Promise<string>
        dependencyInsight: (cwd: string, dependency: string, configuration?: string) => Promise<string>
      }

      go: {
        detect: (cwd: string) => Promise<{ hasGoMod: boolean; path: string }>
        list: (cwd: string) => Promise<GoModuleInfo[]>
        search: (query: string, cwd?: string) => Promise<GoModuleInfo[]>
        versions: (modulePath: string, cwd?: string) => Promise<string[]>
        install: (args: GoInstallArgs) => Promise<string>
        uninstall: (args: GoPackageArgs) => Promise<string>
        update: (args: { modulePath?: string; cwd: string }) => Promise<string>
        tidy: (cwd: string) => Promise<string>
        graph: (cwd: string) => Promise<string>
        audit: (cwd: string) => Promise<{ raw: string; error?: string }>
        run: (cwd: string, commandLine: string) => Promise<string>
      }

      native: {
        detect: (cwd: string) => Promise<NativeDetectResult>
        list: (cwd: string) => Promise<NativeDependencyInfo[]>
        search: (query: string) => Promise<NativeDependencyInfo[]>
        install: (args: NativeInstallArgs) => Promise<string>
        uninstall: (args: NativeRemoveArgs) => Promise<string>
        run: (args: NativeRunArgs) => Promise<string>
        configure: (cwd: string, buildDir?: string) => Promise<string>
        build: (cwd: string, buildDir?: string) => Promise<string>
      }

      dependencyHealth: {
        scan: (manager: DependencyHealthManager, cwd: string) => Promise<DependencyHealthScanResult>
        fix: (cwd: string, action: DependencyHealthAction) => Promise<string>
      }

      terminal: {
        create: (cwd?: string) => Promise<TerminalSessionInfo>
        write: (id: string, data: string) => Promise<void>
        kill: (id: string) => Promise<void>
      }
      
      watcher: {
        start: (projectPath: string) => Promise<void>
        stop: (projectPath?: string) => Promise<void>
        onChange: (callback: (data: FileChangeData) => void) => void
        removeChangeListener: () => void
      }
      
      project: {
        detect: (projectPath: string) => Promise<any>
        readPackage: (projectPath: string) => Promise<any>
        writePackage: (projectPath: string, content: any) => Promise<void>
        getPackagePath: (projectPath: string) => Promise<string>
        getNodeModulesPath: (projectPath: string, packageName: string) => Promise<string>
        toolchain: {
          get: (projectPath: string) => Promise<ToolchainConfig>
          set: (projectPath: string, tool: ToolName, toolPath: string) => Promise<ToolchainConfig>
          clear: (projectPath: string, tool: ToolName) => Promise<ToolchainConfig>
          check: (projectPath: string) => Promise<ToolStatus[]>
        }
      }
      
      publish: {
        check: (projectPath: string) => Promise<any>
        publish: (args: PublishArgs) => Promise<string>
      }
      
      system: {
        openPath: (path: string) => Promise<void>
        openFile: (filePath: string) => Promise<void>
        getNpmInfo: () => Promise<any>
        getCachePath: () => Promise<string>
        setCachePath: (newPath: string) => Promise<void>
        clearCache: () => Promise<string>
        updateNpm: () => Promise<string>
        npmHelp: (command?: string) => Promise<string>
        checkTools: () => Promise<ToolStatus[]>
        setToolPath: (tool: ToolName, toolPath: string) => Promise<ToolStatus[]>
        openToolDownload: (tool: ToolName) => Promise<void>
        openTerminal: (cwd: string) => Promise<void>
      }
      
      openExternal: (url: string) => Promise<void>
      
      onCommandLog: (callback: (data: CommandLogEntry) => void) => void
      removeCommandLogListener: () => void
      onTerminalData: (callback: (data: TerminalData) => void) => void
      onTerminalExit: (callback: (data: TerminalExitData) => void) => void
      removeTerminalListeners: () => void
    }
  }
  
  interface CommandLogEntry {
    id: string
    timestamp: number
    command: string
    output?: string
    error?: string
    status: 'running' | 'success' | 'error'
  }
  
  interface PackageSizeInfo {
    unpackedSize: number
    fileCount: number
    packedSize: string | number
    prettySize: string
  }
  
  interface DependencyTreeNode {
    name: string
    version: string
    dependencies: DependencyTreeNode[]
  }
  
  interface AuditResult {
    vulnerabilities?: Record<string, any>
    error?: string
    metadata?: {
      vulnerabilities: {
        info: number
        low: number
        moderate: number
        high: number
        critical: number
      }
      dependencies: number
      devDependencies: number
    }
  }
  
  interface DownloadStats {
    downloads: number
    start?: string
    end?: string
    package?: string
  }

  interface NpmVersionInfo {
    version: string
    date?: string
    tags: string[]
    prerelease: boolean
    channel: string
  }

  interface NpmVersionMetadata {
    name: string
    description: string
    distTags: Record<string, string>
    versions: NpmVersionInfo[]
    stable: NpmVersionInfo[]
    prerelease: NpmVersionInfo[]
    latest: string
  }

  interface PipPackageInfo {
    name: string
    version: string
    latest?: string
    type?: string
  }

  interface PipPackageDetail {
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

  interface PipDependencyTreeNode {
    name: string
    version: string
    dependencies: PipDependencyTreeNode[]
  }

  interface PipRepairResult {
    checkedOutput: string
    actions: string[]
    success: number
    failed: number
    output: string
  }

  interface PipPublishArgs {
    cwd: string
    repositoryUrl?: string
    username?: string
    password?: string
    buildBefore?: boolean
  }

  interface PipInstallArgs {
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
  }

  interface PipPackageArgs {
    packageName: string
    cwd?: string
    user?: boolean
    version?: string
    breakSystemPackages?: boolean
  }

  interface PipCommandOptions {
    cwd?: string
    user?: boolean
    breakSystemPackages?: boolean
  }

  type PipConfigScope = 'user' | 'global' | 'site'

  interface PipConfigItem {
    key: string
    value: string
  }

  interface PipSearchResult {
    name: string
    version?: string
    description?: string
  }

  interface PipAuditIssue {
    name: string
    version: string
    id: string
    fixVersions: string[]
    description: string
    aliases?: string[]
  }

  interface MavenDependencyInfo {
    groupId: string
    artifactId: string
    version: string
    scope?: string
    type?: string
  }

  interface MavenSearchResult extends MavenDependencyInfo {
    latestVersion?: string
    description?: string
    repository?: string
  }

  type MavenSearchMode = 'startsWith' | 'contains' | 'exact' | 'keyword'
  type MavenSearchScope = 'artifactId' | 'groupId' | 'coordinate' | 'all'
  type MavenSearchSource = 'mavenCentral' | 'nexus'

  interface MavenSearchOptions {
    mode?: MavenSearchMode
    scope?: MavenSearchScope
    source?: MavenSearchSource
    customUrl?: string
    includeLocal?: boolean
    limit?: number
  }

  interface MavenDependencyTreeNode extends MavenDependencyInfo {
    name: string
    dependencies: MavenDependencyTreeNode[]
  }

  interface MavenGlobalInfo {
    version: string
    localRepository: string
    settingsPath: string
    hasSettings: boolean
  }

  interface MavenAuditIssue {
    dependency: string
    fileName?: string
    severity: string
    name: string
    description: string
    url?: string
  }

  interface MavenDeployArgs {
    cwd: string
    repositoryId?: string
    repositoryUrl?: string
    skipTests?: boolean
    goals?: string
  }

  interface TerminalSessionInfo {
    id: string
    cwd: string
    shell: string
  }

  interface TerminalData {
    id: string
    data: string
    stream: 'stdout' | 'stderr'
  }

  interface TerminalExitData {
    id: string
    code: number | null
  }

  type ToolName = 'npm' | 'pip' | 'maven' | 'cargo' | 'gradle' | 'go' | 'cmake' | 'vcpkg' | 'conan'
  type PackageManagerId = 'npm' | 'pip' | 'maven' | 'cargo' | 'gradle' | 'go' | 'native'
  type DependencyHealthManager = PackageManagerId
  type DependencyHealthSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
  type DependencyHealthIssueType =
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
  type AppLanguage = 'zh-CN' | 'en-US'

  interface StartupLanguageInfo {
    language: AppLanguage
    source: 'installer' | 'default'
    shouldPrompt: boolean
    isPackaged: boolean
    isPortable: boolean
  }

  interface ToolStatus {
    tool: ToolName
    available: boolean
    version: string
    configuredPath?: string
    downloadUrl: string
    message?: string
  }

  interface ToolchainConfig {
    npm?: string
    pip?: string
    maven?: string
    cargo?: string
    gradle?: string
    go?: string
    cmake?: string
    vcpkg?: string
    conan?: string
  }

  interface PackageManagerPlugin {
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

  interface CargoDependencyInfo {
    name: string
    version: string
    type: 'dependencies' | 'dev-dependencies' | 'build-dependencies'
    source?: string
    optional?: boolean
  }

  interface CargoSearchResult {
    name: string
    version?: string
    description?: string
  }

  interface CargoInstallArgs {
    packageName: string
    version?: string
    cwd: string
    type?: CargoDependencyInfo['type']
    features?: string
  }

  interface CargoPackageArgs {
    packageName: string
    cwd: string
    type?: CargoDependencyInfo['type']
  }

  interface GradleDependencyInfo {
    groupId: string
    artifactId: string
    version: string
    configuration: string
  }

  interface GradleSearchResult extends GradleDependencyInfo {
    latestVersion?: string
    description?: string
    repository?: string
  }

  interface GradleDependencyArgs extends GradleDependencyInfo {
    cwd: string
  }

  interface GradleRemoveDependencyArgs {
    cwd: string
    groupId: string
    artifactId: string
    configuration?: string
  }

  interface GoModuleInfo {
    path: string
    version: string
    latest?: string
    indirect?: boolean
    replace?: string
    description?: string
    repositoryUrl?: string
    stars?: number
  }

  interface GoInstallArgs {
    modulePath: string
    version?: string
    cwd: string
  }

  interface GoPackageArgs {
    modulePath: string
    cwd: string
  }

  interface NativeDetectResult {
    hasNativeProject: boolean
    hasCMakeLists: boolean
    hasVcpkgManifest: boolean
    hasConanfile: boolean
    cmakePath: string
    vcpkgPath: string
    conanfilePath: string
  }

  type NativeDependencyManager = 'vcpkg' | 'conan' | 'cmake' | 'library'
  type NativeLibraryKind = 'shared' | 'static' | 'import' | 'framework'

  interface NativeDependencyInfo {
    name: string
    version?: string
    manager: NativeDependencyManager
    source?: string
    kind?: NativeLibraryKind
    path?: string
    linkage?: 'dynamic' | 'static' | 'unknown'
    requiredBy?: string
  }

  interface NativeInstallArgs {
    cwd: string
    manager: 'vcpkg' | 'conan'
    name: string
    version?: string
    feature?: string
  }

  interface NativeRemoveArgs {
    cwd: string
    manager: 'vcpkg' | 'conan'
    name: string
  }

  interface NativeRunArgs {
    cwd: string
    tool: 'cmake' | 'vcpkg' | 'conan'
    commandLine: string
  }

  interface DependencyHealthAction {
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

  interface DependencyHealthIssue {
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

  interface DependencyHealthSummary {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    info: number
  }

  interface DependencyHealthScanResult {
    manager: DependencyHealthManager
    cwd: string
    scannedAt: string
    summary: DependencyHealthSummary
    issues: DependencyHealthIssue[]
    raw?: string
  }
  
  interface FileChangeData {
    type: 'package.json'
    path: string
  }

  interface InstallArgs {
    packageName: string
    cwd?: string
    global?: boolean
    dev?: boolean
    version?: string
  }

  interface UninstallArgs {
    packageName: string
    cwd?: string
    global?: boolean
  }

  interface UpdateArgs {
    packageName?: string
    cwd?: string
    global?: boolean
    version?: string
  }

  interface PublishArgs {
    cwd: string
    tag?: string
    access?: 'public' | 'restricted'
    registry?: string
  }

  interface MoveDepArgs {
    packageName: string
    cwd: string
    from: 'dependencies' | 'devDependencies'
    to: 'dependencies' | 'devDependencies'
  }

  interface InstallVersionArgs {
    packageName: string
    version: string
    cwd?: string
    global?: boolean
    dev?: boolean
  }
}

export {}
