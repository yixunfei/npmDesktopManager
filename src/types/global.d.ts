import { InstallArgs, UninstallArgs, UpdateArgs, PublishArgs, MoveDepArgs, InstallVersionArgs } from '../../electron/preload'

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
        auditFix: (cwd: string) => Promise<string>
        getReadme: (packageName: string) => Promise<string>
        getDependents: (packageName: string) => Promise<number>
        downloadStats: (packageName: string) => Promise<DownloadStats>
        getProjectDependencyTree: (cwd: string, depth?: number) => Promise<any>
        getGlobalDependencyTree: (depth?: number) => Promise<any>
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
        openTerminal: (cwd: string) => Promise<void>
      }
      
      openExternal: (url: string) => Promise<void>
    }
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
  
  interface FileChangeData {
    type: 'package.json'
    path: string
  }
}

export {}