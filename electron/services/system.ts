import { exec } from 'child_process'
import { promisify } from 'util'
import { app, shell } from 'electron'
import { join } from 'path'

const execAsync = promisify(exec)

export class SystemService {
  async getNpmInfo(): Promise<any> {
    try {
      const { stdout: npmVersion } = await execAsync('npm --version')
      const { stdout: nodeVersion } = await execAsync('node --version')
      
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
      const { stdout } = await execAsync('npm config get cache')
      return stdout.trim()
    } catch (error) {
      return ''
    }
  }

  async setCachePath(newPath: string): Promise<void> {
    await execAsync(`npm config set cache ${newPath}`)
  }

  async clearCache(): Promise<string> {
    const { stdout, stderr } = await execAsync('npm cache clean --force')
    return stdout || stderr
  }

  async updateNpm(): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync('npm install -g npm@latest')
      return stdout || stderr
    } catch (error: any) {
      throw new Error(error.message)
    }
  }

  async npmHelp(command?: string): Promise<string> {
    try {
      let cmd = 'npm help'
      if (command) {
        cmd = `npm help ${command}`
      }
      const { stdout } = await execAsync(cmd)
      return stdout
    } catch (error: any) {
      return error.stdout || error.message
    }
  }

  async openTerminal(cwd: string): Promise<void> {
    const platform = process.platform
    
    if (platform === 'win32') {
      await execAsync(`start cmd.exe /K "cd /d ${cwd}"`, { cwd })
    } else if (platform === 'darwin') {
      await execAsync(`open -a Terminal.app "${cwd}"`, { cwd })
    } else if (platform === 'linux') {
      await execAsync(`gnome-terminal --working-directory="${cwd}"`, { cwd })
    }
  }
}