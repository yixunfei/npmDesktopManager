import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { resolveToolBin } from './toolchain'
import { resolveShellFreeCommand } from './commandRunner'
import { commandEnv, decodeCommandChunk } from './encoding'

const execFileAsync = promisify(execFile)
function run(bin: string, args: string[] = [], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const command = resolveShellFreeCommand(bin, args)
  return execFileAsync(command.bin, command.args, {
    cwd,
    env: commandEnv(),
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
    encoding: 'buffer'
  }).then((result) => ({
    stdout: decodeBuffer(result.stdout),
    stderr: decodeBuffer(result.stderr)
  }))
}

export class SystemService {
  async getNpmInfo(): Promise<any> {
    const info: Record<string, string> = {
      npmVersion: '',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron || app.getVersion()
    }

    try {
      const { stdout } = await run(await resolveToolBin('npm'), ['--version'])
      info.npmVersion = stdout.trim()
    } catch (error: any) {
      info.npmError = readableError(error)
    }

    try {
      const { stdout } = await run('node', ['--version'])
      info.nodeVersion = stdout.trim() || info.nodeVersion
    } catch (error: any) {
      info.nodeError = readableError(error)
    }

    return info
  }

  async getCachePath(): Promise<string> {
    try {
      const { stdout } = await run(await resolveToolBin('npm'), ['config', 'get', 'cache'])
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async setCachePath(newPath: string): Promise<void> {
    await run(await resolveToolBin('npm'), ['config', 'set', 'cache', newPath])
  }

  async clearCache(): Promise<string> {
    const { stdout, stderr } = await run(await resolveToolBin('npm'), ['cache', 'clean', '--force'])
    return stdout || stderr
  }

  async updateNpm(): Promise<string> {
    try {
      const { stdout, stderr } = await run(await resolveToolBin('npm'), ['install', '-g', 'npm@latest'])
      return stdout || stderr
    } catch (error: any) {
      throw new Error(error.message)
    }
  }

  async npmHelp(command?: string): Promise<string> {
    try {
      const args = command ? ['help', command] : ['help']
      const { stdout } = await run(await resolveToolBin('npm'), args)
      return stdout
    } catch (error: any) {
      return error.stdout || error.message
    }
  }

  async openTerminal(cwd: string): Promise<void> {
    const platform = process.platform
    
    if (platform === 'win32') {
      spawn('cmd.exe', ['/K', 'cd', '/d', cwd], { cwd, detached: true, stdio: 'ignore', windowsHide: false }).unref()
    } else if (platform === 'darwin') {
      spawn('open', ['-a', 'Terminal.app', cwd], { cwd, detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'linux') {
      spawn('gnome-terminal', [`--working-directory=${cwd}`], { cwd, detached: true, stdio: 'ignore' }).unref()
    }
  }
}

function decodeBuffer(value: Buffer | string): string {
  if (typeof value === 'string') return value
  return decodeCommandChunk(value)
}

function readableError(error: any): string {
  const stdout = error?.stdout ? decodeBuffer(error.stdout) : ''
  const stderr = error?.stderr ? decodeBuffer(error.stderr) : ''
  return (stderr || stdout || error?.message || String(error)).trim()
}
