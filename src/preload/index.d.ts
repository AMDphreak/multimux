import { ElectronAPI } from '@electron-toolkit/preload'
import { ProbeResult, MuxOptions } from '../main/muxer'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      probeFile: (filePath: string) => Promise<ProbeResult>
      selectInputFile: () => Promise<string | undefined>
      selectOutputFile: (defaultPath: string) => Promise<string | undefined>
      openExplorer: (filePath: string) => Promise<void>
      muxAudio: (options: MuxOptions) => Promise<void>
      onMuxProgress: (callback: (data: { percent: number; rawLine: string }) => void) => () => void
      onMuxLog: (callback: (line: string) => void) => () => void
    }
  }
}
