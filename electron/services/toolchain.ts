import { app, shell } from 'electron'
import { access, mkdir, readFile, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { runLoggedCommand } from './commandRunner'

export type ToolName = 'npm' | 'pip' | 'maven'

export interface ToolchainConfig {
  npm?: string
  pip?: string
  maven?: string
}

export interface ToolStatus {
  tool: ToolName
  available: boolean
  version: string
  configuredPath?: string
  downloadUrl: string
  message?: string
}

const DEFAULT_DOWNLOADS: Record<ToolName, string> = {
  npm: 'https://nodejs.org/en/download',
  pip: 'https://www.python.org/downloads/',
  maven: 'https://maven.apache.org/download.cgi'
}

const DEFAULT_BINS: Record<ToolName, string> = {
  npm: process.platform === 'win32' ? 'npm.cmd' : 'npm',
  pip: process.platform === 'win32' ? 'pip.exe' : 'pip',
  maven: process.platform === 'win32' ? 'mvn.cmd' : 'mvn'
}

export async function getToolchainConfig(): Promise<ToolchainConfig> {
  try {
    return JSON.parse(await readFile(configPath(), 'utf-8'))
  } catch {
    return {}
  }
}

export async function setToolPath(tool: ToolName, toolPath: string): Promise<ToolchainConfig> {
  const config = await getToolchainConfig()
  const value = toolPath.trim()
  if (value) {
    config[tool] = value
  } else {
    delete config[tool]
  }

  await mkdir(dirname(configPath()), { recursive: true })
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
  return config
}

export async function resolveToolBin(tool: ToolName): Promise<string> {
  const config = await getToolchainConfig()
  const configuredPath = config[tool]
  if (!configuredPath) return DEFAULT_BINS[tool]

  if (await isDirectory(configuredPath)) {
    if (tool === 'maven') {
      return await firstExisting([
        join(configuredPath, DEFAULT_BINS.maven),
        join(configuredPath, 'bin', DEFAULT_BINS.maven)
      ], join(configuredPath, DEFAULT_BINS.maven))
    }
    return join(configuredPath, DEFAULT_BINS[tool])
  }

  return configuredPath
}

export async function checkTool(tool: ToolName): Promise<ToolStatus> {
  const config = await getToolchainConfig()
  const configuredPath = config[tool]
  const candidates = await getCheckCandidates(tool, configuredPath)

  let lastError: any
  for (const candidate of candidates) {
    try {
      if (candidate.configured) {
        await accessIfConfigured(configuredPath)
      }
      const { stdout, stderr } = await runLoggedCommand(candidate.bin, candidate.args, {
        log: false,
        maxBuffer: 1024 * 1024,
        displayBin: tool === 'maven' ? 'mvn' : tool
      })
      return {
        tool,
        available: true,
        version: (stdout || stderr).split(/\r?\n/)[0]?.trim() || 'available',
        configuredPath,
        downloadUrl: DEFAULT_DOWNLOADS[tool]
      }
    } catch (error: any) {
      lastError = error
    }
  }

  return {
    tool,
    available: false,
    version: '',
    configuredPath,
    downloadUrl: DEFAULT_DOWNLOADS[tool],
    message: lastError?.message || `${tool} is not available`
  }
}

export async function checkTools(): Promise<ToolStatus[]> {
  return Promise.all(['npm', 'pip', 'maven'].map((tool) => checkTool(tool as ToolName)))
}

export async function openToolDownload(tool: ToolName): Promise<void> {
  await shell.openExternal(DEFAULT_DOWNLOADS[tool])
}

function configPath(): string {
  return join(app.getPath('userData'), 'toolchain.json')
}

async function accessIfConfigured(toolPath?: string): Promise<void> {
  if (toolPath) {
    await access(toolPath)
  }
}

async function getCheckCandidates(tool: ToolName, configuredPath?: string): Promise<Array<{ bin: string; args: string[]; configured?: boolean }>> {
  if (configuredPath) {
    if (await isDirectory(configuredPath)) {
      if (tool === 'pip') {
        return [
          { bin: join(configuredPath, 'python.exe'), args: ['-m', 'pip', '--version'], configured: true },
          { bin: join(configuredPath, 'python'), args: ['-m', 'pip', '--version'], configured: true },
          { bin: join(configuredPath, 'Scripts', 'pip.exe'), args: ['--version'], configured: true },
          { bin: join(configuredPath, 'bin', 'pip'), args: ['--version'], configured: true },
          { bin: join(configuredPath, DEFAULT_BINS.pip), args: ['--version'], configured: true }
        ]
      }
      if (tool === 'maven') {
        return [
          { bin: join(configuredPath, DEFAULT_BINS.maven), args: ['-version'], configured: true },
          { bin: join(configuredPath, 'bin', DEFAULT_BINS.maven), args: ['-version'], configured: true }
        ]
      }
      return [{ bin: join(configuredPath, DEFAULT_BINS[tool]), args: tool === 'maven' ? ['-version'] : ['--version'], configured: true }]
    }

    return [{ bin: configuredPath, args: tool === 'maven' ? ['-version'] : ['--version'], configured: true }]
  }

  if (tool === 'pip') {
    return process.platform === 'win32'
      ? [
          { bin: 'python.exe', args: ['-m', 'pip', '--version'] },
          { bin: 'py.exe', args: ['-m', 'pip', '--version'] },
          { bin: 'pip.exe', args: ['--version'] }
        ]
      : [
          { bin: 'python3', args: ['-m', 'pip', '--version'] },
          { bin: 'python', args: ['-m', 'pip', '--version'] },
          { bin: 'pip3', args: ['--version'] },
          { bin: 'pip', args: ['--version'] }
        ]
  }

  return [{ bin: DEFAULT_BINS[tool], args: tool === 'maven' ? ['-version'] : ['--version'] }]
}

async function firstExisting(paths: string[], fallback: string): Promise<string> {
  for (const path of paths) {
    try {
      await access(path)
      return path
    } catch {
    }
  }
  return fallback
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
