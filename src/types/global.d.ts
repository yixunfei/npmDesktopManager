declare global {
  interface Window {
    electronAPI: {
      getDefaultPath: () => Promise<string>
      selectDirectory: () => Promise<string | null>
      
      npm: {
        search: (query: string) => Promise<any[]>
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
        configList: (scope?: PipConfigScope) => Promise<PipConfigItem[]>
        configFile: (scope?: PipConfigScope) => Promise<string>
        backupConfig: (scope?: PipConfigScope) => Promise<string>
        configSet: (scope: PipConfigScope, key: string, value: string) => Promise<void>
        configUnset: (scope: PipConfigScope, key: string) => Promise<void>
        cacheDir: () => Promise<string>
        cachePurge: () => Promise<string>
        audit: (cwd?: string) => Promise<{ issues: PipAuditIssue[]; raw: string; error?: string }>
        installTool: (tool: 'pip-audit' | 'pipdeptree', cwd?: string) => Promise<string>
        dependencyTree: (cwd?: string) => Promise<any>
      }

      maven: {
        detect: (cwd: string) => Promise<{ hasPom: boolean; path: string }>
        list: (cwd: string) => Promise<MavenDependencyInfo[]>
        tree: (cwd: string) => Promise<string>
        runGoal: (cwd: string, goal: string) => Promise<string>
        search: (query: string) => Promise<MavenSearchResult[]>
        versions: (groupId: string, artifactId: string) => Promise<string[]>
        info: (cwd?: string) => Promise<MavenGlobalInfo>
        effectiveSettings: (cwd?: string) => Promise<string>
        ensureSettings: () => Promise<string>
        backupSettings: () => Promise<string>
        setLocalRepository: (repositoryPath: string) => Promise<void>
        setMirror: (id: string, url: string, mirrorOf?: string) => Promise<void>
        securityAudit: (cwd: string) => Promise<{ issues: MavenAuditIssue[]; reportPath: string; raw?: string; error?: string }>
        goOffline: (cwd: string) => Promise<string>
        purgeLocalRepository: (cwd: string) => Promise<string>
        addDependency: (cwd: string, dep: MavenDependencyInfo) => Promise<void>
        removeDependency: (cwd: string, dep: Pick<MavenDependencyInfo, 'groupId' | 'artifactId'>) => Promise<void>
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

  type ToolName = 'npm' | 'pip' | 'maven'

  interface ToolStatus {
    tool: ToolName
    available: boolean
    version: string
    configuredPath?: string
    downloadUrl: string
    message?: string
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
