import { BrowserWindow } from 'electron'

export type CommandLogStatus = 'running' | 'success' | 'error'

let commandLogWindow: BrowserWindow | null = null

export function setCommandLogWindow(window: BrowserWindow | null) {
  commandLogWindow = window
}

export function createLogId(): string {
  return `${Date.now()}${Math.random().toString(36).slice(2, 11)}`
}

export function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args.map(formatArg)].join(' ')
}

export function sendCommandLog(
  id: string,
  command: string,
  output?: string,
  error?: string,
  status: CommandLogStatus = 'running'
) {
  try {
    if (commandLogWindow && !commandLogWindow.isDestroyed()) {
      commandLogWindow.webContents.send('command-log', {
        id,
        timestamp: Date.now(),
        command,
        output: truncateTail(output),
        error: truncateTail(error),
        status
      })
    }
  } catch {
  }
}

function formatArg(arg: string): string {
  return /\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

function truncateTail(value?: string): string | undefined {
  if (!value) return undefined
  const maxLength = 12000
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}
