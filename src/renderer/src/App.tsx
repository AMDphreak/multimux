import { createSignal, createEffect, For, Show } from 'solid-js'

interface AudioStreamState {
  index: number
  relativeIndex: number
  enabled: boolean
  volume: number // coefficient 0.0 to 2.0
  title: string
  codec: string
  channels: number
}

interface VideoStreamState {
  index: number
  codec: string
  width: number
  height: number
  avg_frame_rate?: string
}

export default function App() {
  // File states
  const [filePath, setFilePath] = createSignal<string>('')
  const [fileName, setFileName] = createSignal<string>('')
  const [duration, setDuration] = createSignal<number>(0)
  const [fileSize, setFileSize] = createSignal<string>('')

  const [audioStreams, setAudioStreams] = createSignal<AudioStreamState[]>([])
  const [videoStream, setVideoStream] = createSignal<VideoStreamState | null>(null)

  // Drag states
  const [isDragOver, setIsDragOver] = createSignal<boolean>(false)

  // Muxing settings
  const [audioCodec, setAudioCodec] = createSignal<string>('aac')
  const [audioBitrate, setAudioBitrate] = createSignal<string>('192k')
  const [outputPath, setOutputPath] = createSignal<string>('')

  // Processing states
  const [isProcessing, setIsProcessing] = createSignal<boolean>(false)
  const [progress, setProgress] = createSignal<number>(0)
  const [logs, setLogs] = createSignal<string[]>([])
  const [error, setError] = createSignal<string>('')
  const [success, setSuccess] = createSignal<boolean>(false)

  let logTerminalEndRef: HTMLDivElement | undefined

  // Clean filename and directory when path changes
  createEffect(() => {
    const path = filePath()
    if (path) {
      // Simple parse for cross-platform file names
      const parts = path.split(/[/\\]/)
      const name = parts[parts.length - 1]
      setFileName(name)

      const dir = parts.slice(0, parts.length - 1).join('\\') + '\\'

      // Auto default output path to "mixed_[original_name].mkv" in same directory
      const extIndex = name.lastIndexOf('.')
      const baseName = extIndex !== -1 ? name.substring(0, extIndex) : name
      const ext = extIndex !== -1 ? name.substring(extIndex) : '.mkv'
      setOutputPath(`${dir}mixed_${baseName}${ext}`)
    }
  })

  // Format seconds to HH:MM:SS
  const formatDuration = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00:00'
    const h = Math.floor(secs / 3600)
      .toString()
      .padStart(2, '0')
    const m = Math.floor((secs % 3600) / 60)
      .toString()
      .padStart(2, '0')
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  // Handle file drop
  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (isProcessing()) return

    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      const file = files[0]
      // In Electron, File objects contain the full OS absolute path!
      const path = (file as any).path || file.name
      await loadFile(path)
    }
  }

  // Manual file input selection
  const handleManualSelect = async (): Promise<void> => {
    try {
      const selected = await window.api.selectInputFile()
      if (selected) {
        loadFile(selected)
      }
    } catch (err: any) {
      console.error('Open dialog error:', err)
      setError(`Failed to select file: ${err.message || String(err)}`)
    }
  }

  // Probe file using main IPC
  const loadFile = async (path: string) => {
    setError('')
    setSuccess(false)
    setProgress(0)

    try {
      const result = await window.api.probeFile(path)

      // Extract video stream
      const video = result.streams.find((s) => s.codec_type === 'video')
      if (video) {
        setVideoStream({
          index: video.index,
          codec: video.codec_name,
          width: video.width as number,
          height: video.height as number,
          avg_frame_rate: video.avg_frame_rate
        })
      } else {
        setVideoStream(null)
      }

      // Extract audio streams
      let audioRelIdx = 0
      const audios: AudioStreamState[] = []

      for (const s of result.streams) {
        if (s.codec_type === 'audio') {
          audios.push({
            index: s.index,
            relativeIndex: audioRelIdx++,
            enabled: true,
            volume: 1.0, // Default 0dB normal volume
            title: s.tags?.title || `Audio Track ${audioRelIdx}`,
            codec: s.codec_name,
            channels: s.channels || 2
          })
        }
      }

      setAudioStreams(audios)

      // File duration
      const durStr = result.format?.duration || '0'
      setDuration(parseFloat(durStr))

      // File size formatted
      const sizeBytes = parseInt(result.format?.size || '0', 10)
      if (sizeBytes > 0) {
        const gb = sizeBytes / (1024 * 1024 * 1024)
        if (gb >= 1) {
          setFileSize(`${gb.toFixed(2)} GB`)
        } else {
          setFileSize(`${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`)
        }
      } else {
        setFileSize('Unknown size')
      }

      setFilePath(path)
    } catch (err: any) {
      setError(`Failed to read media metadata: ${err.message || String(err)}`)
    }
  }

  // Trigger Save File dialog
  const browseOutputPath = async () => {
    if (!filePath()) return
    try {
      const selected = await window.api.selectOutputFile(outputPath())
      if (selected) {
        setOutputPath(selected)
      }
    } catch (err: any) {
      console.error('Save dialog error:', err)
    }
  }

  // Render Volume coefficient in Decibels (dB)
  const getDbLabel = (volume: number) => {
    if (volume === 0) return 'MUTE'
    const db = 20 * Math.log10(volume)
    if (db === 0) return '0.0 dB'
    return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`
  }

  // Set stream volume
  const setStreamVolume = (relIndex: number, volume: number) => {
    setAudioStreams((prev) =>
      prev.map((s) => (s.relativeIndex === relIndex ? { ...s, volume } : s))
    )
  }

  // Toggle stream status
  const toggleStream = (relIndex: number) => {
    setAudioStreams((prev) =>
      prev.map((s) => (s.relativeIndex === relIndex ? { ...s, enabled: !s.enabled } : s))
    )
  }

  // Launch mixing process
  const triggerMux = async () => {
    if (!filePath()) return

    // Validate output path
    if (!outputPath().trim()) {
      setError('Please specify a valid output path.')
      return
    }

    const activeStreams = audioStreams().filter((s) => s.enabled)

    setError('')
    setSuccess(false)
    setLogs([
      '[multimux] Initializing master mixing thread...',
      `[multimux] Input file: ${filePath()}`,
      `[multimux] Target output: ${outputPath()}`
    ])
    setProgress(0)
    setIsProcessing(true)

    // Setup listeners
    const cleanupProgress = window.api.onMuxProgress((data) => {
      setProgress(data.percent)
    })

    const cleanupLog = window.api.onMuxLog((line) => {
      setLogs((prev) => [...prev, line.trim()])
      // Auto scroll terminal
      if (logTerminalEndRef) {
        logTerminalEndRef.scrollIntoView({ behavior: 'smooth' })
      }
    })

    try {
      const options = {
        filePath: filePath(),
        outputPath: outputPath(),
        audioCodec: audioCodec(),
        audioBitrate: audioBitrate(),
        duration: duration(),
        selectedStreams: activeStreams.map((s) => ({
          relativeIndex: s.relativeIndex,
          volume: s.volume
        }))
      }

      await window.api.muxAudio(options)
      setProgress(100)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setIsProcessing(false)
      cleanupProgress()
      cleanupLog()
    }
  }

  // Open explorer for output file
  const openOutputFileInExplorer = () => {
    if (outputPath()) {
      window.api.openExplorer(outputPath())
    }
  }

  // Drag listeners
  const onDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const onDragLeave = () => {
    setIsDragOver(false)
  }

  return (
    <div class="flex flex-col h-screen w-full relative">
      {/* Console Top Header */}
      <header class="h-16 flex items-center justify-between px-6 bg-zinc-900 border-b border-zinc-950 shrink-0 shadow-lg relative z-10 select-none">
        <div class="flex items-center gap-4">
          {/* Glowing Green Power Indicator */}
          <div class="flex items-center gap-2 bg-black px-3 py-1.5 rounded border border-zinc-800">
            <div class="w-2.5 h-2.5 rounded-full led-green"></div>
            <span class="text-[10px] text-zinc-400 font-bold tracking-widest uppercase">
              Console Power
            </span>
          </div>
          <h1 class="text-xs font-bold text-zinc-200 tracking-[0.25em] uppercase font-mono">
            multimux{' '}
            <span class="text-zinc-500 font-normal tracking-normal text-[10px] ml-1">
              // Master Audio Mixdown Suite
            </span>
          </h1>
        </div>
        <div class="text-[10px] text-zinc-500 font-mono tracking-wider">
          SYSTEM_OS: WINDOWS // BUILD: v0.1.1
        </div>
      </header>

      {/* Main Board Surface */}
      <main class="flex-1 p-6 overflow-hidden flex flex-col items-center justify-center relative">
        <Show
          when={filePath()}
          fallback={
            /* INLET PORT Dropzone (No File Loaded) */
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={handleDrop}
              class={`w-full max-w-3xl aspect-[16/9] concrete-plate flex flex-col items-center justify-center p-8 transition-all duration-300 relative border-2 ${
                isDragOver()
                  ? 'border-emerald-500 bg-[#eaeaea] shadow-inner scale-[1.01]'
                  : 'border-[#a8a89e] bg-[#e4e4db]'
              }`}
            >
              {/* Dropzone Inner Recessed Cavity */}
              <div
                class={`w-full h-full border border-dashed rounded-lg flex flex-col items-center justify-center p-8 transition-all duration-300 ${
                  isDragOver()
                    ? 'border-emerald-500 bg-[#eefaf4]'
                    : 'border-zinc-400 bg-black/[0.02]'
                }`}
              >
                {/* Circular inlet plate icon representing physical port */}
                <div
                  class={`w-24 h-24 rounded-full flex items-center justify-center mb-6 border transition-all duration-300 ${
                    isDragOver()
                      ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : 'bg-[#d6d6cd] border-[#b0b0a5] shadow-md'
                  }`}
                >
                  <svg
                    class={`w-10 h-10 transition-colors duration-300 ${isDragOver() ? 'text-emerald-500' : 'text-zinc-600'}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </div>

                <h3 class="text-sm font-bold tracking-widest text-zinc-800 uppercase mb-2">
                  Inlet Port: Drop File Here
                </h3>
                <p class="text-xs text-zinc-500 tracking-wider mb-6 text-center max-w-md leading-relaxed">
                  Drop multi-track recording (.MKV, .MP4, .TS, .MOV) into this console cavity to
                  analyze channels
                </p>

                {/* Tactical manual select button */}
                <button
                  onClick={handleManualSelect}
                  class="tactile-button text-[10px] font-bold tracking-widest uppercase px-6 py-3 cursor-pointer hover:bg-zinc-100 transition-colors active:translate-y-0.5"
                >
                  Browse Storage File
                </button>
              </div>

              {/* Status footer inside dropzone */}
              <div class="absolute bottom-4 left-6 flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full led-amber"></div>
                <span class="text-[9px] font-mono tracking-wider text-zinc-500 uppercase">
                  Console Awaiting Load
                </span>
              </div>
            </div>
          }
        >
          {/* THE MIXING CONSOLE DESK (File Loaded) */}
          <div class="w-full max-w-6xl h-full flex gap-6 overflow-hidden items-stretch select-none">
            {/* Left Column: Input Source & Serial Plate */}
            <div class="w-72 shrink-0 flex flex-col gap-6">
              {/* Media Inspector Serial Plate */}
              <div class="concrete-plate p-4 flex flex-col relative flex-1 min-h-[300px]">
                <div class="text-[10px] font-bold text-zinc-500 tracking-widest uppercase mb-4 font-mono pb-2 border-b border-[#cbcbbf]">
                  // File Inspector
                </div>

                {/* Rigid Metal Serial Spec Card */}
                <div class="bg-[#f0f0e8] border border-[#cfcfc4] rounded p-3 font-mono text-[10px] text-zinc-800 leading-relaxed shadow-sm mb-4">
                  <div
                    class="font-bold text-zinc-950 border-b border-[#cfcfc4] pb-1.5 mb-2 truncate"
                    title={fileName()}
                  >
                    FILE: {fileName()}
                  </div>
                  <div class="grid grid-cols-2 gap-y-1.5 gap-x-2">
                    <span class="text-zinc-500">FORMAT:</span>
                    <span class="text-right uppercase">{fileName().split('.').pop() || 'MKV'}</span>

                    <span class="text-zinc-500">SIZE:</span>
                    <span class="text-right font-bold">{fileSize()}</span>

                    <span class="text-zinc-500">DURATION:</span>
                    <span class="text-right font-bold text-emerald-800">
                      {formatDuration(duration())}
                    </span>

                    <Show when={videoStream()}>
                      <span class="text-zinc-500">VIDEO:</span>
                      <span class="text-right truncate uppercase">{videoStream()?.codec}</span>

                      <span class="text-zinc-500">RESOLUTION:</span>
                      <span class="text-right font-bold">
                        {videoStream()?.width}x{videoStream()?.height}
                      </span>
                    </Show>
                  </div>
                </div>

                {/* Tactical Eject File button */}
                <button
                  onClick={() => {
                    setFilePath('')
                    setAudioStreams([])
                    setVideoStream(null)
                  }}
                  class="tactile-button py-2 w-full text-[9px] font-bold tracking-widest uppercase bg-red-500/10 text-red-700 border-red-300 hover:bg-red-500/15"
                >
                  Eject File
                </button>
              </div>

              {/* Mux Output Controller Plate */}
              <div class="concrete-plate p-4 flex flex-col gap-4">
                <div class="text-[10px] font-bold text-zinc-500 tracking-widest uppercase font-mono pb-2 border-b border-[#cbcbbf]">
                  // Output Mux Specs
                </div>

                {/* Output File Recessed Slot */}
                <div class="flex flex-col gap-1.5">
                  <label class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
                    Save Target File
                  </label>
                  <div class="flex gap-2">
                    <div class="flex-1 recessed-well px-3 py-2 flex items-center justify-start text-[10px] font-mono text-emerald-400 select-all overflow-x-auto whitespace-nowrap scrollbar-none max-w-[180px]">
                      {outputPath()}
                    </div>
                    <button
                      onClick={browseOutputPath}
                      class="tactile-button w-9 h-8 flex items-center justify-center shrink-0"
                      title="Select Destination Location"
                    >
                      <svg
                        class="w-4 h-4 text-zinc-700"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Settings Block: Codec & Bitrate */}
                <div class="grid grid-cols-2 gap-3">
                  <div class="flex flex-col gap-1.5">
                    <label class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
                      Audio Codec
                    </label>
                    <div class="grid grid-cols-2 bg-[#d7d7ce] p-0.5 rounded border border-[#b5b5ab]">
                      <button
                        onClick={() => setAudioCodec('aac')}
                        class={`py-1 text-[9px] font-mono font-bold rounded transition-colors ${
                          audioCodec() === 'aac'
                            ? 'bg-[#9e9e94] text-white shadow-inner'
                            : 'text-zinc-700 hover:text-zinc-950'
                        }`}
                      >
                        AAC
                      </button>
                      <button
                        onClick={() => setAudioCodec('libopus')}
                        class={`py-1 text-[9px] font-mono font-bold rounded transition-colors ${
                          audioCodec() === 'libopus'
                            ? 'bg-[#9e9e94] text-white shadow-inner'
                            : 'text-zinc-700 hover:text-zinc-950'
                        }`}
                      >
                        OPUS
                      </button>
                    </div>
                  </div>

                  <div class="flex flex-col gap-1.5">
                    <label class="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
                      Bitrate
                    </label>
                    <select
                      value={audioBitrate()}
                      onChange={(e) => setAudioBitrate(e.currentTarget.value)}
                      class="bg-[#dcdcd3] border border-[#a3a398] rounded px-1.5 py-1 text-[9px] font-mono font-bold text-zinc-800 outline-none"
                    >
                      <option value="128k">128k</option>
                      <option value="192k">192k</option>
                      <option value="256k">256k</option>
                      <option value="320k">320k</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Column: Tactile Hardware Fader Board */}
            <div class="flex-1 concrete-plate p-5 flex flex-col min-w-0">
              <div class="text-[10px] font-bold text-zinc-500 tracking-widest uppercase font-mono pb-2 border-b border-[#cbcbbf] shrink-0 mb-4 flex items-center justify-between">
                <span>// Tactical Channel Strips</span>
                <span class="text-[8px] text-zinc-400 normal-case">
                  // TIP: DOUBLE-CLICK KNOB TO RESET TO 0dB (NORMAL VOLUME)
                </span>
              </div>

              {/* Horizontal List of Channels */}
              <div class="flex-1 flex gap-4 items-stretch justify-start overflow-x-auto py-2 custom-scroll">
                <For
                  each={audioStreams()}
                  fallback={
                    <div class="flex-1 flex flex-col items-center justify-center text-zinc-400 font-mono text-xs">
                      No Audio Channels Detected in File
                    </div>
                  }
                >
                  {(stream) => {
                    // Simple drag handler calculations
                    let dragContainer: HTMLDivElement | undefined

                    const handlePointerDown = (e: PointerEvent) => {
                      if (!dragContainer) return
                      e.preventDefault()
                      dragContainer.setPointerCapture(e.pointerId)

                      const updateVolume = (event: PointerEvent) => {
                        if (!dragContainer) return
                        const rect = dragContainer.getBoundingClientRect()

                        // Calculate percentage from bottom of slot
                        // Recess slot height is 100%, bottom is 0% volume, top is 200% volume
                        const percentage = 1 - (event.clientY - rect.top) / rect.height
                        const clamped = Math.max(0, Math.min(2, percentage * 2))

                        // Snap zone: if coefficient is very close to 1.0 (between 0.96 and 1.04), snap to exactly 1.0 (0dB)
                        const snapped = clamped >= 0.94 && clamped <= 1.06 ? 1.0 : clamped
                        setStreamVolume(stream.relativeIndex, parseFloat(snapped.toFixed(2)))
                      }

                      const handlePointerMove = (event: PointerEvent) => {
                        updateVolume(event)
                      }

                      const handlePointerUp = (event: PointerEvent) => {
                        if (!dragContainer) return
                        try {
                          dragContainer.releasePointerCapture(event.pointerId)
                        } catch (err) {}
                        dragContainer.removeEventListener('pointermove', handlePointerMove)
                        dragContainer.removeEventListener('pointerup', handlePointerUp)
                      }

                      dragContainer.addEventListener('pointermove', handlePointerMove)
                      dragContainer.addEventListener('pointerup', handlePointerUp)
                      updateVolume(e)
                    }

                    return (
                      /* Channel Strip Panel */
                      <div class="w-32 bg-[#ebebe4] border border-[#c2c2b7] rounded shadow-inner p-3 flex flex-col items-center shrink-0 select-none">
                        {/* Top indicator: Glowing analog LED */}
                        <div class="flex items-center gap-1.5 mb-2.5">
                          <div
                            class={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                              stream.enabled ? 'led-green' : 'led-green-dim'
                            }`}
                          ></div>
                          <span class="text-[8px] font-mono text-zinc-500 font-bold uppercase">
                            CH {stream.relativeIndex + 1}
                          </span>
                        </div>

                        {/* Stream specifications */}
                        <div class="text-center font-mono w-full mb-3 pb-1.5 border-b border-[#d8d8ce]">
                          <div
                            class="text-[9px] font-bold text-zinc-800 truncate"
                            title={stream.title}
                          >
                            {stream.title}
                          </div>
                          <div class="text-[8px] text-zinc-400 font-semibold uppercase mt-0.5">
                            {stream.codec} / {stream.channels}ch
                          </div>
                        </div>

                        {/* Tactical Toggle Flip Switch */}
                        <div class="flex flex-col items-center gap-1 mb-5">
                          <span class="text-[7px] font-mono font-bold tracking-widest text-zinc-400 uppercase">
                            MUTE / INCL
                          </span>
                          <button
                            onClick={() => toggleStream(stream.relativeIndex)}
                            class="w-12 h-6 toggle-switch-track p-0.5 flex items-center relative"
                          >
                            <div
                              class="w-5 h-5 toggle-switch-handle flex items-center justify-center"
                              style={{
                                transform: stream.enabled ? 'translateX(24px)' : 'translateX(0px)'
                              }}
                            >
                              <div class={`w-1 h-2 bg-zinc-600 rounded-sm`}></div>
                            </div>
                          </button>
                        </div>

                        {/* Recessed Vertical Slider Guide Slot */}
                        <div class="flex-1 flex gap-2 w-full items-stretch justify-center py-2 h-[180px]">
                          {/* Scale dB ticks */}
                          <div class="flex flex-col justify-between text-[7px] font-mono text-zinc-400 text-right pr-1 select-none leading-none">
                            <span>+6</span>
                            <span>+3</span>
                            <span>0</span>
                            <span>-3</span>
                            <span>-6</span>
                            <span>-12</span>
                            <span>-24</span>
                            <span>-oo</span>
                          </div>

                          {/* Recessed slot track wrapper */}
                          <div
                            ref={dragContainer}
                            onPointerDown={handlePointerDown}
                            class="w-8 relative recessed-well px-1.5 py-1.5 flex items-center justify-center cursor-ns-resize"
                          >
                            {/* Inner thin slider metal slide rod */}
                            <div class="w-1 h-full tactile-slider-track absolute left-[14px]"></div>

                            {/* Grabable Fader Slider metal knob cap */}
                            <div
                              onDblClick={() => setStreamVolume(stream.relativeIndex, 1.0)}
                              class="w-7 h-5 absolute left-[3.5px] tactile-slider-thumb flex items-center justify-center transition-all duration-75 select-none"
                              style={{
                                // volume is 0.0 to 2.0. Map it to bottom (0px) to top (100% fader height)
                                // Slider height is ~150px active sliding distance. knob center offset.
                                bottom: `calc(${(stream.volume / 2) * 100}% - 10px)`
                              }}
                            >
                              {/* Specular center red line like high-end mixers */}
                              <div class="w-full h-[2px] bg-red-600 shadow-sm"></div>
                            </div>
                          </div>
                        </div>

                        {/* Digital Volumetric display tag */}
                        <div
                          class={`w-full mt-4 py-1 rounded text-center text-[9px] font-mono font-bold leading-none select-all transition-colors ${
                            stream.enabled
                              ? stream.volume === 1.0
                                ? 'bg-zinc-800 text-zinc-300'
                                : 'bg-emerald-950 text-emerald-400'
                              : 'bg-zinc-300 text-zinc-500'
                          }`}
                        >
                          {stream.enabled ? getDbLabel(stream.volume) : 'MUTED'}
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>

              {/* Master Mix Button and Controls in console footer */}
              <div class="mt-4 pt-4 border-t border-[#cbcbbf] shrink-0 flex items-center justify-between">
                {/* Diagnostic message block */}
                <div class="flex-1 mr-6">
                  <Show when={error()}>
                    <div class="text-[9px] font-mono font-bold text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
                      <div class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></div>
                      <span>ERROR: {error()}</span>
                    </div>
                  </Show>
                  <Show when={!error() && audioStreams().length > 0}>
                    <div class="text-[9px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                      <div class="w-1.5 h-1.5 rounded-full led-amber"></div>
                      <span>
                        Mixing {audioStreams().filter((s) => s.enabled).length} audio tracks down to
                        Track 1
                      </span>
                    </div>
                  </Show>
                </div>

                {/* Circular mechanical push button */}
                <button
                  onClick={triggerMux}
                  disabled={isProcessing() || audioStreams().length === 0}
                  class="tactile-button px-8 py-3 text-xs font-mono font-bold tracking-[0.2em] uppercase bg-gradient-to-bottom from-[#ffa600]/10 to-[#ffa600]/20 text-[#ffa600] border-[#ffa600]/50 hover:bg-[#ffa600]/15 flex items-center gap-3 shrink-0"
                >
                  <div class="w-2.5 h-2.5 rounded-full led-amber"></div>
                  <span>Mix & Mux Master</span>
                </button>
              </div>
            </div>
          </div>
        </Show>
      </main>

      {/* RENDER PROGRESS SCREEN (CRT MONITOR OVERLAY) */}
      <Show when={isProcessing() || success() || (error() && isProcessing())}>
        <div class="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div class="w-full max-w-3xl zinc-panel flex flex-col h-[520px] rounded-lg overflow-hidden border border-zinc-800 relative z-10">
            {/* CRT Screen Bezel Glow Header */}
            <div class="bg-zinc-950 px-5 py-3 border-b border-zinc-900 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class={`w-2 h-2 rounded-full ${success() ? 'led-green' : 'led-amber animate-pulse'}`}
                ></div>
                <span class="text-[10px] font-mono font-bold tracking-widest text-zinc-400 uppercase">
                  {success() ? 'MASTER COMPILE COMPLETED' : 'COMPILING MASTER AUDIO DOWN-MIX...'}
                </span>
              </div>
              <div class="text-[9px] font-mono text-zinc-600">THREAD_ID: FFMPEG_SPAWN</div>
            </div>

            {/* CRT terminal screen body */}
            <div class="flex-1 p-5 flex flex-col gap-4 overflow-hidden bg-black text-[#2ed573] font-mono select-text relative">
              {/* Glass raster effect overlay */}
              <div class="absolute inset-0 bg-[radial-gradient(transparent_50%,rgba(0,0,0,0.25)_100%)] pointer-events-none z-10"></div>

              {/* Overall Progress Metrics */}
              <div class="bg-zinc-950/80 border border-[#2ed573]/20 rounded p-4 flex flex-col gap-3 relative z-20">
                <div class="flex justify-between text-[11px] font-bold tracking-widest uppercase">
                  <span>Mux Target Progress</span>
                  <span class="text-[14px] text-emerald-400">{progress().toFixed(1)}%</span>
                </div>

                {/* Horizontal recessed fader progress track */}
                <div class="h-6 w-full recessed-well p-0.5 flex items-center relative overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-[#2ec4b6]/20 to-[#2ec4b6] rounded-sm transition-all duration-300 relative"
                    style={{ width: `${progress()}%` }}
                  >
                    {/* Glowing lead edge */}
                    <div class="absolute right-0 top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_#2ec4b6]"></div>
                  </div>
                </div>

                <div class="flex justify-between text-[9px] text-[#2ed573]/60 tracking-wider">
                  <span>INPUT_FILE: {fileName()}</span>
                  <span>TIME_DOMAIN: {formatDuration(duration())}</span>
                </div>
              </div>

              {/* Scrollable Live FFmpeg Terminal Feed */}
              <div class="flex-1 bg-zinc-950/90 border border-[#2ed573]/10 rounded p-3 overflow-y-auto font-mono text-[9px] text-[#2ed573]/85 leading-relaxed custom-scroll z-20 flex flex-col gap-1 select-all select-none">
                <For each={logs()}>
                  {(log) => <div class="whitespace-pre-wrap break-all select-all">{log}</div>}
                </For>
                <div ref={logTerminalEndRef}></div>
              </div>

              {/* Status footer button panel inside CRT screen */}
              <div class="pt-2 border-t border-[#2ed573]/20 flex items-center justify-between shrink-0 z-20 select-none">
                <div>
                  <Show when={error()}>
                    <span class="text-xs text-red-500 font-bold uppercase tracking-widest animate-pulse">
                      MUX FAILED
                    </span>
                  </Show>
                  <Show when={success()}>
                    <span class="text-xs text-emerald-400 font-bold uppercase tracking-widest">
                      SUCCESSFULLY COMPILED
                    </span>
                  </Show>
                  <Show when={isProcessing()}>
                    <span class="text-[9px] text-[#2ed573]/50 uppercase tracking-widest flex items-center gap-2">
                      <svg
                        class="animate-spin h-3.5 w-3.5 text-[#2ed573]"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Mixing audio waves...
                    </span>
                  </Show>
                </div>

                <div class="flex gap-3">
                  <Show when={success()}>
                    <button
                      onClick={openOutputFileInExplorer}
                      class="tactile-button py-2.5 px-5 text-[10px] font-mono font-bold tracking-widest uppercase bg-gradient-to-b from-[#2ed573]/10 to-[#2ed573]/20 border-[#2ed573]/50 text-[#2ed573] active:translate-y-0.5"
                    >
                      Open File Location
                    </button>
                  </Show>
                  <button
                    onClick={() => {
                      if (!isProcessing()) {
                        setIsProcessing(false)
                        setSuccess(false)
                        setError('')
                        setLogs([])
                      }
                    }}
                    disabled={isProcessing()}
                    class="tactile-button py-2.5 px-6 text-[10px] font-mono font-bold tracking-widest uppercase text-zinc-300 bg-zinc-800 border-zinc-700 active:translate-y-0.5 hover:text-white"
                  >
                    {success() ? 'Mux Another' : error() ? 'Go Back' : 'Cancel Process'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
