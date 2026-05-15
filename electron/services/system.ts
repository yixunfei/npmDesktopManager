import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(bin: string, args: string[] = [], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(bin, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true
  })
}

export class SystemService {
  async getNpmInfo(): Promise<any> {
    try {
      const { stdout: npmVersion } = await run(NPM_BIN, ['--version'])
      const { stdout: nodeVersion } = await run('node', ['--version'])
      
      return {
        npmVersion: npmVersion.trim(),
        nodeVersion: nodeVersion.trim(),
        platform: process.platform,
        arch: process.arch,
        electronVersion: app.getVersion()
      }
    } catch (error) {
      throw new Error('Failed to get npm info')
    }
  }

  async getCachePath(): Promise<string> {
    try {
      const { stdout } = await run(NPM_BIN, ['config', 'get', 'cache'])
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async setCachePath(newPath: string): Promise<void> {
    await run(NPM_BIN, ['config', 'set', 'cache', newPath])
  }

  async clearCache(): Promise<string> {
    const { stdout, stderr } = await run(NPM_BIN, ['cache', 'clean', '--force'])
    return stdout || stderr
  }

  async updateNpm(): Promise<string> {
    try {
      const { stdout, stderr } = await run(NPM_BIN, ['install', '-g', 'npm@latest'])
      return stdout || stderr
    } catch (error: any) {
      throw new Error(error.message)
    }
  }

  async npmHelp(command?: string): Promise<string> {
    try {
      const args = command ? ['help', command] : ['help']
      const { stdout } = await run(NPM_BIN, args)
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
