import { BrowserWindow } from 'electron'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { createLogId } from './commandLogger'
import { commandEnv, decodeCommandChunk } from './encoding'

interface TerminalSession {
  id: string
  cwd: string
  child: ChildProcessWithoutNullStreams
}

let terminalWindow: BrowserWindow | null = null

export function setTerminalWindow(window: BrowserWindow | null) {
  terminalWindow = window
}

export class TerminalService {
  private sessions = new Map<string, TerminalSession>()

  create(cwd?: string): { id: string; cwd: string; shell: string } {
    const id = createLogId()
    const workingDirectory = this.resolveCwd(cwd)
    const shell = this.getShell()
    const child = spawn(shell.bin, shell.args, {
      cwd: workingDirectory,
      env: commandEnv({ TERM: process.env.TERM || 'xterm-256color' }),
      shell: false,
      windowsHide: true
    })

    const session: TerminalSession = { id, cwd: workingDirectory, child }
    this.sessions.set(id, session)

    child.stdout.on('data', (chunk) => {
      this.send('terminal:data', { id, data: decodeCommandChunk(chunk), stream: 'stdout' })
    })

    child.stderr.on('data', (chunk) => {
      this.send('terminal:data', { id, data: decodeCommandChunk(chunk), stream: 'stderr' })
    })

    child.on('error', (error) => {
      this.send('terminal:data', { id, data: `${error.message}\n`, stream: 'stderr' })
    })

    child.on('close', (code) => {
      this.sessions.delete(id)
      this.send('terminal:exit', { id, code })
    })

    return { id, cwd: workingDirectory, shell: shell.label }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session || session.child.killed) {
      throw new Error('Terminal session is not available')
    }
    session.child.stdin.write(data)
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.child.kill()
    this.sessions.delete(id)
  }

  killAll(): void {
    for (const id of this.sessions.keys()) {
      this.kill(id)
    }
  }

  private resolveCwd(cwd?: string): string {
    if (cwd && existsSync(cwd)) {
      return cwd
    }
    return homedir()
  }

  private getShell(): { bin: string; args: string[]; label: string } {
    if (process.platform === 'win32') {
      return {
        bin: 'powershell.exe',
        args: [
          '-NoLogo',
          '-NoExit',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          '$utf8 = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8; $OutputEncoding = $utf8; chcp 65001 > $null'
        ],
        label: 'PowerShell'
      }
    }

    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
    return {
      bin: shell,
      args: ['-l'],
      label: shell.split('/').pop() || shell
    }
  }

  private send(channel: string, payload: any): void {
    try {
      if (terminalWindow && !terminalWindow.isDestroyed()) {
        terminalWindow.webContents.send(channel, payload)
      }
    } catch {
    }
  }
}
