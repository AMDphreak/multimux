import { spawn } from 'child_process'

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
    relativeIndex: number // e.g., 0 for first audio stream, 1 for second, etc.
    volume: number       // volume coefficient (e.g., 1.0)
  }[]
  duration: number       // duration in seconds
}

/**
 * Run ffprobe on the target file and return parsed JSON metadata.
 */
export function probeFile(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const ffprobeCmd = process.platform === 'win32' ? 'ffprobe' : 'ffprobe'
    const args = [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_name,codec_type,channels,channel_layout,bit_rate:stream_tags=title,language:format=duration,size,bit_rate',
      '-of', 'json',
      filePath
    ]

    const child = spawn(ffprobeCmd, args)
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
          reject(new Error(`Failed to parse ffprobe output: ${err instanceof Error ? err.message : String(err)}`))
        }
      } else {
        reject(new Error(`ffprobe failed with exit code ${code}. Stderr: ${stderr}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`))
    })
  })
}

/**
 * Execute ffmpeg to mix selected audio streams into a single audio track, keeping video intact via passthrough.
 */
export function muxAudio(
  options: MuxOptions,
  onProgress: (percent: number, rawLine: string) => void,
  onLog: (line: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { filePath, outputPath, audioCodec, audioBitrate, selectedStreams, duration } = options
    const ffmpegCmd = process.platform === 'win32' ? 'ffmpeg' : 'ffmpeg'

    const args: string[] = ['-y', '-i', filePath]

    if (selectedStreams.length === 0) {
      // Stripping all audio
      args.push('-map', '0:v', '-c:v', 'copy', '-an', outputPath)
    } else if (selectedStreams.length === 1) {
      // Single audio track, apply volume if not 1.0, otherwise we can just map and transcode or copy
      const stream = selectedStreams[0]
      if (stream.volume === 1.0 && (audioCodec === 'copy' || audioCodec === 'passthrough')) {
        args.push(
          '-map', '0:v',
          '-map', `0:a:${stream.relativeIndex}`,
          '-c:v', 'copy',
          '-c:a', 'copy',
          outputPath
        )
      } else {
        const volumeFilter = `[0:a:${stream.relativeIndex}]volume=${stream.volume}[a]`
        args.push(
          '-filter_complex', volumeFilter,
          '-map', '0:v',
          '-map', '[a]',
          '-c:v', 'copy',
          '-c:a', audioCodec === 'copy' ? 'aac' : audioCodec,
          '-b:a', audioBitrate,
          outputPath
        )
      }
    } else {
      // Multiple audio tracks to be mixed via amix
      let filter = ''
      const inputLabels: string[] = []
      selectedStreams.forEach((stream, i) => {
        const label = `a${i}`
        filter += `[0:a:${stream.relativeIndex}]volume=${stream.volume}[${label}]; `
        inputLabels.push(`[${label}]`)
      })
      filter += `${inputLabels.join('')}amix=inputs=${selectedStreams.length}:duration=longest:dropout_transition=0[a]`

      args.push(
        '-filter_complex', filter,
        '-map', '0:v',
        '-map', '[a]',
        '-c:v', 'copy',
        '-c:a', audioCodec === 'copy' ? 'aac' : audioCodec,
        '-b:a', audioBitrate,
        outputPath
      )
    }

    onLog(`Spawning FFmpeg with args: ${args.join(' ')}`)
    const child = spawn(ffmpegCmd, args)
    let stderrAccumulator = ''

    child.stdout.on('data', (data) => {
      onLog(data.toString())
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderrAccumulator += chunk
      onLog(chunk)

      // Look for lines containing "time=HH:MM:SS.xx"
      const lines = chunk.split(/[\r\n]+/)
      for (const line of lines) {
        if (!line.trim()) continue
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = parseInt(timeMatch[3], 10)
          const ms = parseInt(timeMatch[4], 10)
          const currentSeconds = hours * 3600 + minutes * 60 + seconds + ms / 100
          const percent = Math.min(99.9, Math.max(0, (currentSeconds / duration) * 100))
          onProgress(percent, line)
        }
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        onProgress(100, 'FFmpeg process completed successfully.')
        resolve()
      } else {
        reject(new Error(`ffmpeg failed with exit code ${code}.\nLogs:\n${stderrAccumulator}`))
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`))
    })
  })
}
