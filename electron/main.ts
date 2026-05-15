import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import { join } from 'path'
import { NpmService, setNpmServiceWindow } from './services/npm'
import { ProjectService } from './services/project'
import { PublishService } from './services/publish'
import { SystemService } from './services/system'
import { PipService } from './services/pip'
import { MavenService } from './services/maven'
import { TerminalService, setTerminalWindow } from './services/terminal'
import { checkTools, openToolDownload, setToolPath, clearToolPath, getProjectToolchainConfig, checkTool } from './services/toolchain'
import { fileWatcher } from './services/watcher'

const mainDir = __dirname

let mainWindow: BrowserWindow | null = null
const npmService = new NpmService()
const projectService = new ProjectService()
const publishService = new PublishService()
const systemService = new SystemService()
const pipService = new PipService()
const mavenService = new MavenService()
const terminalService = new TerminalService()

function createWindow() {
  let iconPath: string;
  
  if (process.env.NODE_ENV === 'development') {
    iconPath = join(mainDir, '../../icon.jpg');
  } else {
    iconPath = join(process.resourcesPath, 'icon.jpg');
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    icon: iconPath,
    webPreferences: {
      preload: join(mainDir, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    titleBarStyle: 'hiddenInset',
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  setNpmServiceWindow(mainWindow)
  setTerminalWindow(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(mainDir, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    setNpmServiceWindow(null as any)
    setTerminalWindow(null)
    terminalService.killAll()
  })
}

const template: any[] = [
  {
    label: '文件',
    submenu: [
      { role: 'quit', label: '退出' }
    ]
  },
  {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' }
    ]
  },
  {
    label: '视图',
    submenu: [
      { role: 'reload', label: '重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '重置缩放' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' }
    ]
  },
  {
    label: '帮助',
    submenu: [
      {
        label: '关于',
        click: async () => {
          dialog.showMessageBox(mainWindow!, {
            type: 'info',
            title: '关于 npmDesktopManager',
            message: 'npmDesktopManager v1.0.0',
            detail: '一个图形化的 npm 包管理工具\n支持项目依赖和全局包管理'
          })
        }
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)

app.whenReady().then(() => {
  createWindow()
  setupIpcHandlers()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

function setupIpcHandlers() {
  ipcMain.handle('get-default-path', async () => {
    return app.getPath('home') || process.cwd()
  })

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('npm:search', async (_, query: string) => {
    return await npmService.search(query)
  })

  ipcMain.handle('npm:view', async (_, packageName: string) => {
    return await npmService.view(packageName)
  })

  ipcMain.handle('npm:install', async (_, args) => {
    return await npmService.install(args)
  })

  ipcMain.handle('npm:uninstall', async (_, args) => {
    return await npmService.uninstall(args)
  })

  ipcMain.handle('npm:update', async (_, args) => {
    return await npmService.update(args)
  })

  ipcMain.handle('npm:outdated', async (_, cwd: string) => {
    return await npmService.outdated(cwd)
  })

  ipcMain.handle('npm:list', async (_, cwd: string, global: boolean) => {
    return await npmService.list(cwd, global)
  })

  ipcMain.handle('npm:config-list', async () => {
    return await npmService.configList()
  })

  ipcMain.handle('npm:config-set', async (_, key: string, value: string) => {
    return await npmService.configSet(key, value)
  })

  ipcMain.handle('npm:whoami', async () => {
    return await npmService.whoami()
  })

  ipcMain.handle('npm:login', async (_, registry?: string) => {
    return await npmService.login(registry)
  })

  ipcMain.handle('npm:logout', async (_, registry?: string) => {
    return await npmService.logout(registry)
  })

  ipcMain.handle('project:detect', async (_, projectPath: string) => {
    return await projectService.detectProject(projectPath)
  })

  ipcMain.handle('project:read-package', async (_, projectPath: string) => {
    return await projectService.readPackageJson(projectPath)
  })

  ipcMain.handle('project:toolchain-get', async (_, projectPath: string) => {
    return await getProjectToolchainConfig(projectPath)
  })

  ipcMain.handle('project:toolchain-set', async (_, projectPath: string, tool, toolPath: string) => {
    return await setToolPath(tool, toolPath, projectPath)
  })

  ipcMain.handle('project:toolchain-clear', async (_, projectPath: string, tool) => {
    return await clearToolPath(tool, projectPath)
  })

  ipcMain.handle('project:toolchain-check', async (_, projectPath: string) => {
    return await Promise.all(['npm', 'pip', 'maven'].map((tool) => checkTool(tool as any, projectPath)))
  })

  ipcMain.handle('publish:check', async (_, projectPath: string) => {
    return await publishService.check(projectPath)
  })

  ipcMain.handle('publish:publish', async (_, args) => {
    return await publishService.publish(args)
  })

  ipcMain.handle('open-external', async (_, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('system:open-path', async (_, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle('system:open-file', async (_, filePath: string) => {
    shell.openPath(filePath)
  })

  ipcMain.handle('system:get-npm-info', async () => {
    return await systemService.getNpmInfo()
  })

  ipcMain.handle('system:get-cache-path', async () => {
    return await systemService.getCachePath()
  })

  ipcMain.handle('system:set-cache-path', async (_, newPath: string) => {
    return await systemService.setCachePath(newPath)
  })

  ipcMain.handle('system:clear-cache', async () => {
    return await systemService.clearCache()
  })

  ipcMain.handle('system:update-npm', async () => {
    return await systemService.updateNpm()
  })

  ipcMain.handle('system:npm-help', async (_, command?: string) => {
    return await systemService.npmHelp(command)
  })

  ipcMain.handle('system:check-tools', async () => {
    return await checkTools()
  })

  ipcMain.handle('system:set-tool-path', async (_, tool, toolPath: string) => {
    await setToolPath(tool, toolPath)
    return await checkTools()
  })

  ipcMain.handle('system:open-tool-download', async (_, tool) => {
    return await openToolDownload(tool)
  })

  ipcMain.handle('npm:run-script', async (_, cwd: string, script: string) => {
    return await npmService.runScript(cwd, script)
  })

  ipcMain.handle('npm:get-scripts', async (_, cwd: string) => {
    return await npmService.getScripts(cwd)
  })

  ipcMain.handle('npm:config-get', async (_, key: string) => {
    return await npmService.configGet(key)
  })

  ipcMain.handle('npm:config-delete', async (_, key: string) => {
    return await npmService.configDelete(key)
  })

  ipcMain.handle('npm:config-edit', async () => {
    return await npmService.configEdit()
  })

  ipcMain.handle('npm:move-dep', async (_, args) => {
    return await npmService.moveDependency(args)
  })

  ipcMain.handle('npm:get-published', async (_, username: string) => {
    return await npmService.getPublishedPackages(username)
  })

  ipcMain.handle('npm:check-all-outdated', async (_, cwd: string) => {
    return await npmService.checkAllOutdated(cwd)
  })

  ipcMain.handle('npm:open-terminal', async (_, cwd: string) => {
    return await systemService.openTerminal(cwd)
  })

  ipcMain.handle('project:write-package', async (_, projectPath: string, content: any) => {
    return await projectService.writePackageJson(projectPath, content)
  })

  ipcMain.handle('project:get-package-path', async (_, projectPath: string) => {
    return join(projectPath, 'package.json')
  })

  ipcMain.handle('project:get-node-modules-path', async (_, projectPath: string, packageName: string) => {
    return join(projectPath, 'node_modules', packageName)
  })

  ipcMain.handle('npm:info', async (_, packageName: string) => {
    return await npmService.getPackageInfo(packageName)
  })

  ipcMain.handle('npm:get-versions', async (_, packageName: string) => {
    return await npmService.getVersions(packageName)
  })

  ipcMain.handle('npm:install-version', async (_, args) => {
    return await npmService.installVersion(args)
  })

  ipcMain.handle('npm:global-outdated', async () => {
    return await npmService.globalOutdated()
  })

  ipcMain.handle('npm:adduser', async (_, registry?: string) => {
    return await npmService.adduser(registry)
  })

  ipcMain.handle('npm:get-registry-info', async (_, registry?: string) => {
    return await npmService.getRegistryInfo(registry)
  })

  ipcMain.handle('npm:get-package-size', async (_, packageName: string, version?: string) => {
    return await npmService.getPackageSize(packageName, version)
  })

  ipcMain.handle('npm:get-dependency-tree', async (_, packageName: string, version?: string, depth?: number) => {
    return await npmService.getDependencyTree(packageName, version, depth)
  })

  ipcMain.handle('npm:audit', async (_, cwd: string) => {
    return await npmService.audit(cwd)
  })

  ipcMain.handle('npm:global-audit', async () => {
    return await npmService.globalAudit()
  })

  ipcMain.handle('npm:audit-fix', async (_, cwd: string) => {
    return await npmService.auditFix(cwd)
  })

  ipcMain.handle('npm:get-readme', async (_, packageName: string) => {
    return await npmService.getPackageReadme(packageName)
  })

  ipcMain.handle('npm:get-dependents', async (_, packageName: string) => {
    return await npmService.getDependents(packageName)
  })

  ipcMain.handle('npm:download-stats', async (_, packageName: string) => {
    return await npmService.downloadStats(packageName)
  })

  ipcMain.handle('watch:start', async (_, projectPath: string) => {
    fileWatcher.watchPackageJson(projectPath, () => {
      mainWindow?.webContents.send('file-change', { type: 'package.json', path: projectPath })
    })
  })

  ipcMain.handle('watch:stop', async (_, projectPath?: string) => {
    if (projectPath) {
      fileWatcher.unwatch(join(projectPath, 'package.json'))
    } else {
      fileWatcher.unwatchAll()
    }
  })

  ipcMain.handle('npm:get-project-dependency-tree', async (_, cwd: string, depth: number = 2) => {
    return await npmService.getProjectDependencyTree(cwd, depth)
  })

  ipcMain.handle('npm:get-global-dependency-tree', async (_, depth: number = 1) => {
    return await npmService.getGlobalDependencyTree(depth)
  })

  ipcMain.handle('pip:list', async (_, options?: any) => {
    return await pipService.list(options)
  })

  ipcMain.handle('pip:outdated', async (_, options?: any) => {
    return await pipService.outdated(options)
  })

  ipcMain.handle('pip:install', async (_, args) => {
    return await pipService.install(args)
  })

  ipcMain.handle('pip:uninstall', async (_, args) => {
    return await pipService.uninstall(args)
  })

  ipcMain.handle('pip:update', async (_, args) => {
    return await pipService.update(args)
  })

  ipcMain.handle('pip:update-all', async (_, args) => {
    return await pipService.updateAll(args)
  })

  ipcMain.handle('pip:freeze', async (_, cwd?: string) => {
    return await pipService.freeze(cwd)
  })

  ipcMain.handle('pip:export-requirements', async (_, cwd: string) => {
    return await pipService.exportRequirements(cwd)
  })

  ipcMain.handle('pip:read-requirements', async (_, cwd: string) => {
    return await pipService.readRequirements(cwd)
  })

  ipcMain.handle('pip:search', async (_, query: string, cwd?: string) => {
    return await pipService.search(query, cwd)
  })

  ipcMain.handle('pip:versions', async (_, packageName: string) => {
    return await pipService.versions(packageName)
  })

  ipcMain.handle('pip:show', async (_, packageName: string, cwd?: string) => {
    return await pipService.show(packageName, cwd)
  })

  ipcMain.handle('pip:check', async (_, cwd?: string) => {
    return await pipService.check(cwd)
  })

  ipcMain.handle('pip:repair-check', async (_, cwd?: string) => {
    return await pipService.repairCheck(cwd)
  })

  ipcMain.handle('pip:config-list', async (_, scope?: any) => {
    return await pipService.configList(scope)
  })

  ipcMain.handle('pip:config-file', async (_, scope?: any) => {
    return await pipService.configFile(scope)
  })

  ipcMain.handle('pip:backup-config', async (_, scope?: any) => {
    return await pipService.backupConfig(scope)
  })

  ipcMain.handle('pip:config-set', async (_, scope: any, key: string, value: string) => {
    return await pipService.configSet(scope, key, value)
  })

  ipcMain.handle('pip:config-unset', async (_, scope: any, key: string) => {
    return await pipService.configUnset(scope, key)
  })

  ipcMain.handle('pip:cache-dir', async () => {
    return await pipService.cacheDir()
  })

  ipcMain.handle('pip:cache-purge', async () => {
    return await pipService.cachePurge()
  })

  ipcMain.handle('pip:audit', async (_, cwd?: string) => {
    return await pipService.audit(cwd)
  })

  ipcMain.handle('pip:install-tool', async (_, tool: any, cwd?: string) => {
    return await pipService.installTool(tool, cwd)
  })

  ipcMain.handle('pip:dependency-tree', async (_, cwd?: string) => {
    return await pipService.dependencyTree(cwd)
  })

  ipcMain.handle('pip:publish', async (_, args) => {
    return await pipService.publish(args)
  })

  ipcMain.handle('maven:detect', async (_, cwd: string) => {
    return await mavenService.detect(cwd)
  })

  ipcMain.handle('maven:list', async (_, cwd: string) => {
    return await mavenService.list(cwd)
  })

  ipcMain.handle('maven:tree', async (_, cwd: string) => {
    return await mavenService.tree(cwd)
  })

  ipcMain.handle('maven:dependency-tree', async (_, cwd: string) => {
    return await mavenService.dependencyTree(cwd)
  })

  ipcMain.handle('maven:run-goal', async (_, cwd: string, goal: string) => {
    return await mavenService.runGoal(cwd, goal)
  })

  ipcMain.handle('maven:search', async (_, query: string, cwd?: string) => {
    return await mavenService.search(query, cwd)
  })

  ipcMain.handle('maven:versions', async (_, groupId: string, artifactId: string) => {
    return await mavenService.versions(groupId, artifactId)
  })

  ipcMain.handle('maven:info', async (_, cwd?: string) => {
    return await mavenService.info(cwd)
  })

  ipcMain.handle('maven:effective-settings', async (_, cwd?: string) => {
    return await mavenService.effectiveSettings(cwd)
  })

  ipcMain.handle('maven:ensure-settings', async () => {
    return await mavenService.ensureSettings()
  })

  ipcMain.handle('maven:backup-settings', async () => {
    return await mavenService.backupSettings()
  })

  ipcMain.handle('maven:set-local-repository', async (_, repositoryPath: string) => {
    return await mavenService.setLocalRepository(repositoryPath)
  })

  ipcMain.handle('maven:set-mirror', async (_, id: string, url: string, mirrorOf?: string) => {
    return await mavenService.setMirror(id, url, mirrorOf)
  })

  ipcMain.handle('maven:set-server', async (_, id: string, username: string, password: string) => {
    return await mavenService.setServer(id, username, password)
  })

  ipcMain.handle('maven:deploy', async (_, args) => {
    return await mavenService.deploy(args)
  })

  ipcMain.handle('maven:security-audit', async (_, cwd: string) => {
    return await mavenService.securityAudit(cwd)
  })

  ipcMain.handle('maven:go-offline', async (_, cwd: string) => {
    return await mavenService.goOffline(cwd)
  })

  ipcMain.handle('maven:purge-local-repository', async (_, cwd: string) => {
    return await mavenService.purgeLocalRepository(cwd)
  })

  ipcMain.handle('maven:add-dependency', async (_, cwd: string, dep) => {
    return await mavenService.addDependency(cwd, dep)
  })

  ipcMain.handle('maven:remove-dependency', async (_, cwd: string, dep) => {
    return await mavenService.removeDependency(cwd, dep)
  })

  ipcMain.handle('terminal:create', async (_, cwd?: string) => {
    return terminalService.create(cwd)
  })

  ipcMain.handle('terminal:write', async (_, id: string, data: string) => {
    return terminalService.write(id, data)
  })

  ipcMain.handle('terminal:kill', async (_, id: string) => {
    return terminalService.kill(id)
  })
}
