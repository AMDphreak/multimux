import { spawn } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'

export interface ProbeStream {
  index: number
  codec_name: string
  codec_type: string
  channels?: number
  channel_layout?: string
  bit_rate?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  tags?: {
    title?: string
    language?: string
    [key: string]: string | undefined
  }
}

export interface ProbeResult {
  streams: ProbeStream[]
  format?: {
    duration?: string
    size?: string
    bit_rate?: string
  }
}

export interface MuxOptions {
  filePath: string
  outputPath: string
  audioCodec: string
  audioBitrate: string
  selectedStreams: {
    relativeIndex: number
    volume: number
  }[]
  duration: number
}

/**
 * Returns the path to the D-lang multimux-core binary depending on environment
 */
function getCoreBinaryPath(): string {
  const binaryName = process.platform === 'win32' ? 'multimux-core.exe' : 'multimux-core'
  const devPath = join(__dirname, '../../core', binaryName)
  const prodPath = join(process.resourcesPath, 'bin', binaryName)

  if (app.isPackaged && existsSync(prodPath)) {
    return prodPath
  }
  return devPath
}

/**
 * Run ffprobe via the D-lang multimux-core and return parsed JSON metadata.
 */
export function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const corePath = getCoreBinaryPath()
    const args = ['probe', filePath]

    const child = spawn(corePath, args)
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout) as ProbeResult
          resolve(parsed)
        } catch (err) {
          reject(
            new Error(
              `Failed to parse core probe output: ${err instanceof Error ? err.message : String(err)}`
            )
          )
        }
      } else {
        // Try parsing JSON error line from stdout/stderr
        try {
          const parsed = JSON.parse(stdout)
          if (parsed.type === 'error') {
            reject(new Error(parsed.message))
            return
          }
        } catch (e) {}
        reject(new Error(`Core probe failed with exit code ${code}. Stderr: ${stderr}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn multimux-core: ${err.message}. Ensure it is compiled.`))
    })
  })
}

/**
 * Execute ffmpeg via D-lang multimux-core to mix selected audio streams into a single audio track, keeping video intact.
 */
export function muxAudio(
  options: MuxOptions,
  onProgress: (percent: number, rawLine: string) => void,
  onLog: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const corePath = getCoreBinaryPath()
    const args = ['mux']

    onLog(`Spawning multimux-core supervisor: ${corePath}`)
    const child = spawn(corePath, args)

    // Write the muxing options JSON payload directly into the D supervisor stdin
    const payload = JSON.stringify(options)
    child.stdin.write(payload + '\n')
    child.stdin.end()

    let errorAccumulator = ''

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      const lines = chunk.split(/[\r\n]+/)

      for (const line of lines) {
        if (!line.trim()) continue

        // Parse structured JSON events emitted by D-lang supervisor
        try {
          const event = JSON.parse(line)
          if (event.type === 'progress') {
            onProgress(event.percent, event.message || '')
          } else if (event.type === 'log') {
            onLog(event.message)
          } else if (event.type === 'error') {
            errorAccumulator = event.message
          }
        } catch (err) {
          // Fallback if stdout contains non-JSON lines
          onLog(line)
        }
      }
    })

    child.stderr.on('data', (data) => {
      onLog(`[Core-Stderr] ${data.toString()}`)
    })

    child.on('close', (code) => {
      if (code === 0) {
        onProgress(100, 'Mixdown completed successfully.')
        resolve()
      } else {
        const errorMsg = errorAccumulator || `Supervisor exited with code ${code}`
        reject(new Error(errorMsg))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn multimux-core: ${err.message}`))
    })
  })
}
