import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultPath: () => ipcRenderer.invoke('get-default-path'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  onCommandLog: (callback: (data: any) => void) => {
    ipcRenderer.on('command-log', (_, data) => callback(data))
  },
  removeCommandLogListener: () => {
    ipcRenderer.removeAllListeners('command-log')
  },
  
  npm: {
    search: (query: string) => ipcRenderer.invoke('npm:search', query),
    view: (packageName: string) => ipcRenderer.invoke('npm:view', packageName),
    install: (args: InstallArgs) => ipcRenderer.invoke('npm:install', args),
    uninstall: (args: UninstallArgs) => ipcRenderer.invoke('npm:uninstall', args),
    update: (args: UpdateArgs) => ipcRenderer.invoke('npm:update', args),
    outdated: (cwd: string) => ipcRenderer.invoke('npm:outdated', cwd),
    list: (cwd: string, global: boolean) => ipcRenderer.invoke('npm:list', cwd, global),
    configList: () => ipcRenderer.invoke('npm:config-list'),
    configSet: (key: string, value: string) => ipcRenderer.invoke('npm:config-set', key, value),
    configGet: (key: string) => ipcRenderer.invoke('npm:config-get', key),
    configDelete: (key: string) => ipcRenderer.invoke('npm:config-delete', key),
    configEdit: () => ipcRenderer.invoke('npm:config-edit'),
    whoami: () => ipcRenderer.invoke('npm:whoami'),
    login: (registry?: string) => ipcRenderer.invoke('npm:login', registry),
    logout: (registry?: string) => ipcRenderer.invoke('npm:logout', registry),
    runScript: (cwd: string, script: string) => ipcRenderer.invoke('npm:run-script', cwd, script),
    getScripts: (cwd: string) => ipcRenderer.invoke('npm:get-scripts', cwd),
    moveDep: (args: MoveDepArgs) => ipcRenderer.invoke('npm:move-dep', args),
    getPublished: (username: string) => ipcRenderer.invoke('npm:get-published', username),
    checkAllOutdated: (cwd: string) => ipcRenderer.invoke('npm:check-all-outdated', cwd),
    getPackageInfo: (packageName: string) => ipcRenderer.invoke('npm:info', packageName),
    getVersions: (packageName: string) => ipcRenderer.invoke('npm:get-versions', packageName),
    installVersion: (args: InstallVersionArgs) => ipcRenderer.invoke('npm:install-version', args),
    globalOutdated: () => ipcRenderer.invoke('npm:global-outdated'),
    adduser: (registry?: string) => ipcRenderer.invoke('npm:adduser', registry),
    getRegistryInfo: (registry?: string) => ipcRenderer.invoke('npm:get-registry-info', registry),
    getPackageSize: (packageName: string, version?: string) => ipcRenderer.invoke('npm:get-package-size', packageName, version),
    getDependencyTree: (packageName: string, version?: string, depth?: number) => ipcRenderer.invoke('npm:get-dependency-tree', packageName, version, depth),
    audit: (cwd: string) => ipcRenderer.invoke('npm:audit', cwd),
    auditFix: (cwd: string) => ipcRenderer.invoke('npm:audit-fix', cwd),
    getReadme: (packageName: string) => ipcRenderer.invoke('npm:get-readme', packageName),
    getDependents: (packageName: string) => ipcRenderer.invoke('npm:get-dependents', packageName),
    downloadStats: (packageName: string) => ipcRenderer.invoke('npm:download-stats', packageName),
    getProjectDependencyTree: (cwd: string, depth?: number) => ipcRenderer.invoke('npm:get-project-dependency-tree', cwd, depth),
    getGlobalDependencyTree: (depth?: number) => ipcRenderer.invoke('npm:get-global-dependency-tree', depth)
  },
  
  watcher: {
    start: (projectPath: string) => ipcRenderer.invoke('watch:start', projectPath),
    stop: (projectPath?: string) => ipcRenderer.invoke('watch:stop', projectPath),
    onChange: (callback: (data: any) => void) => {
      ipcRenderer.on('file-change', (_, data) => callback(data))
    },
    removeChangeListener: () => {
      ipcRenderer.removeAllListeners('file-change')
    }
  },
  
  project: {
    detect: (projectPath: string) => ipcRenderer.invoke('project:detect', projectPath),
    readPackage: (projectPath: string) => ipcRenderer.invoke('project:read-package', projectPath),
    writePackage: (projectPath: string, content: any) => ipcRenderer.invoke('project:write-package', projectPath, content),
    getPackagePath: (projectPath: string) => ipcRenderer.invoke('project:get-package-path', projectPath),
    getNodeModulesPath: (projectPath: string, packageName: string) => ipcRenderer.invoke('project:get-node-modules-path', projectPath, packageName)
  },
  
  publish: {
    check: (projectPath: string) => ipcRenderer.invoke('publish:check', projectPath),
    publish: (args: PublishArgs) => ipcRenderer.invoke('publish:publish', args)
  },
  
  system: {
    openPath: (path: string) => ipcRenderer.invoke('system:open-path', path),
    openFile: (filePath: string) => ipcRenderer.invoke('system:open-file', filePath),
    getNpmInfo: () => ipcRenderer.invoke('system:get-npm-info'),
    getCachePath: () => ipcRenderer.invoke('system:get-cache-path'),
    setCachePath: (newPath: string) => ipcRenderer.invoke('system:set-cache-path', newPath),
    clearCache: () => ipcRenderer.invoke('system:clear-cache'),
    updateNpm: () => ipcRenderer.invoke('system:update-npm'),
    npmHelp: (command?: string) => ipcRenderer.invoke('system:npm-help', command),
    openTerminal: (cwd: string) => ipcRenderer.invoke('npm:open-terminal', cwd)
  },
  
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url)
})

export interface InstallArgs {
  packageName: string
  cwd?: string
  global?: boolean
  dev?: boolean
  version?: string
}

export interface UninstallArgs {
  packageName: string
  cwd?: string
  global?: boolean
}

export interface UpdateArgs {
  packageName?: string
  cwd?: string
  global?: boolean
}

export interface PublishArgs {
  cwd: string
  tag?: string
  access?: 'public' | 'restricted'
  registry?: string
}

export interface MoveDepArgs {
  packageName: string
  cwd: string
  from: 'dependencies' | 'devDependencies'
  to: 'dependencies' | 'devDependencies'
}

export interface InstallVersionArgs {
  packageName: string
  version: string
  cwd?: string
  global?: boolean
  dev?: boolean
}