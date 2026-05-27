const fs = require('fs')
const path = require('path')
const Asciidoctor = require('asciidoctor')
const pkg = require('./package.json')

const appVersion = pkg.version

const asciidoctor = Asciidoctor()

// Paths
const rootDir = path.join(__dirname, '..')
const docsDir = path.join(rootDir, 'docs')
const changelogDetailsDir = path.join(rootDir, 'changelog-details')
const distDir = path.join(__dirname, 'dist')
const distDocsDir = path.join(distDir, 'docs')
const distChangelogDir = path.join(distDir, 'changelog-details')

// Create directories
fs.mkdirSync(distDir, { recursive: true })
fs.mkdirSync(distDocsDir, { recursive: true })
fs.mkdirSync(distChangelogDir, { recursive: true })

// Layout Template Wrapper
function wrapHtml(title, content, relativePathToRoot = '.', activePage = '') {
  const pages = [
    { label: 'Home', href: `${relativePathToRoot}/index.html`, id: 'home' },
    { label: 'Tutorial', href: `${relativePathToRoot}/docs/tutorial.html`, id: 'tutorial' },
    { label: 'How-To Guides', href: `${relativePathToRoot}/docs/how-to.html`, id: 'how-to' },
    {
      label: 'Explanation',
      href: `${relativePathToRoot}/docs/explanation.html`,
      id: 'explanation'
    },
    { label: 'Reference', href: `${relativePathToRoot}/docs/reference.html`, id: 'reference' },
    { label: 'Changelog', href: `${relativePathToRoot}/changelog.html`, id: 'changelog' }
  ]

  const navLinks = pages
    .map((p) => {
      const isActive = activePage === p.id
      return `
      <a href="${p.href}" class="flex items-center gap-3 px-4 py-2.5 rounded font-mono text-xs font-bold transition-all ${
        isActive
          ? 'bg-zinc-800 text-emerald-400 border border-zinc-700 shadow-inner'
          : 'text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200'
      }">
        <div class="w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-zinc-600'}"></div>
        <span>${p.label}</span>
      </a>
    `
    })
    .join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} // multimux</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <style>
    :root {
      --concrete-base: #e4e4db;
      --concrete-shadow: #b2b2a8;
      --concrete-highlight: #fcfcf9;
    }
    body {
      background-color: var(--concrete-base);
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.05)),
        repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.01) 0px, rgba(0, 0, 0, 0.01) 2px, transparent 2px, transparent 4px);
      font-family: 'Inter', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    .concrete-plate {
      background-color: var(--concrete-base);
      box-shadow: 
        1px 1px 0px var(--concrete-highlight) inset,
        -1px -1px 0px var(--concrete-shadow) inset,
        0 10px 25px rgba(0, 0, 0, 0.05);
      border: 1px solid var(--concrete-shadow);
      border-radius: 4px;
    }
    /* Style raw AsciiDoc content output */
    .adoc-content h1 {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 1.5rem;
      border-bottom: 2px solid var(--concrete-shadow);
      padding-bottom: 0.5rem;
      margin-bottom: 1.5rem;
      color: #1a1a1a;
      letter-spacing: -0.025em;
      text-transform: uppercase;
    }
    .adoc-content h2 {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 1.1rem;
      margin-top: 2rem;
      margin-bottom: 1rem;
      color: #27272a;
      text-transform: uppercase;
      letter-spacing: -0.01em;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      padding-bottom: 0.25rem;
    }
    .adoc-content h3 {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.95rem;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #3f3f46;
    }
    .adoc-content p {
      margin-bottom: 1.25rem;
      font-size: 0.9rem;
      line-height: 1.6;
      color: #27272a;
    }
    .adoc-content ul {
      list-style-type: decimal;
      padding-left: 1.25rem;
      margin-bottom: 1.25rem;
      font-size: 0.9rem;
      line-height: 1.6;
      color: #27272a;
    }
    .adoc-content li {
      margin-bottom: 0.5rem;
    }
    .adoc-content pre {
      background-color: #18181b;
      color: #a7f3d0;
      padding: 1.25rem;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
      border: 1px solid #09090b;
    }
    .adoc-content code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      background-color: rgba(0,0,0,0.06);
      padding: 0.2rem 0.4rem;
      border-radius: 2px;
      color: #1a1a1a;
      font-weight: 600;
    }
    .adoc-content pre code {
      background-color: transparent;
      padding: 0;
      color: inherit;
      font-weight: inherit;
    }
    .adoc-content .admonitionblock {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 1rem;
      margin-bottom: 1.5rem;
      border-radius: 2px;
    }
    .adoc-content .admonitionblock td.icon {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.8rem;
      color: #b45309;
      padding-right: 1rem;
      vertical-align: top;
    }
    .adoc-content .admonitionblock td.content {
      font-size: 0.85rem;
      color: #78350f;
      line-height: 1.5;
    }
    .adoc-content .admonitionblock td.content p {
      margin-bottom: 0;
    }
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.05);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(0,0,0,0.3);
    }
  </style>
</head>
<body class="flex min-h-screen">

  <!-- Concrete Sidebar Console -->
  <aside class="w-64 bg-zinc-950 text-zinc-200 border-r border-zinc-900 flex flex-col shrink-0">
    <!-- Header Block -->
    <div class="h-16 flex items-center justify-between px-5 bg-zinc-900 border-b border-zinc-950">
      <div class="flex items-center gap-3">
        <div class="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></div>
        <span class="font-mono text-xs font-bold tracking-[0.2em] uppercase text-zinc-100">multimux</span>
      </div>
      <span class="text-[8px] font-mono text-zinc-500 font-bold uppercase">v${appVersion}</span>
    </div>
    
    <!-- Navigation List -->
    <nav class="flex-1 p-4 flex flex-col gap-1.5 overflow-y-auto">
      <div class="text-[8px] font-mono text-zinc-600 font-bold uppercase tracking-widest px-4 mb-2">// Navigation</div>
      ${navLinks}
    </nav>
    
    <!-- Footer credits -->
    <div class="p-4 border-t border-zinc-900 bg-zinc-900/50 flex flex-col gap-1 font-mono text-[8px] text-zinc-500">
      <span>DESIGN: TACTILE CONCRETE</span>
      <span>CORE: D-LANG FFmpeg</span>
      <a href="https://github.com/AMDphreak/multimux" class="text-zinc-400 hover:text-zinc-200 mt-2 flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clip-rule="evenodd" /></svg>
        GitHub Repository
      </a>
    </div>
  </aside>

  <!-- Document Panel Main View -->
  <main class="flex-1 p-8 overflow-y-auto max-w-5xl">
    <article class="concrete-plate p-8 md:p-12 adoc-content">
      ${content}
    </article>
  </main>

</body>
</html>
  `
}

// Convert AsciiDoc function
function compileAdoc(sourcePath, destPath, title, relativePath, activePage) {
  try {
    const raw = fs.readFileSync(sourcePath, 'utf8')
    // Compile using Asciidoctor
    const bodyHtml = asciidoctor.convert(raw, { attributes: { showtitle: true } })
    const fullHtml = wrapHtml(title, bodyHtml, relativePath, activePage)
    fs.writeFileSync(destPath, fullHtml)
    console.log(`✓ Compiled: ${sourcePath} -> ${destPath}`)
  } catch (err) {
    console.error(`✗ Error compiling ${sourcePath}:`, err)
  }
}

// Create custom index homepage (gorgeous skeuomorphic concrete landing page!)
function buildCustomHomepage() {
  const landingPageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>multimux - Master Audio Down-Mixdown Suite</title>
  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <style>
    :root {
      --concrete-base: #e4e4db;
      --concrete-shadow: #b2b2a8;
      --concrete-highlight: #fcfcf9;
      --led-green: #2ed573;
    }
    body {
      background-color: var(--concrete-base);
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.15), rgba(0, 0, 0, 0.05)),
        repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.01) 0px, rgba(0, 0, 0, 0.01) 2px, transparent 2px, transparent 4px);
      font-family: 'Inter', sans-serif;
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    .concrete-plate {
      background-color: var(--concrete-base);
      box-shadow: 
        1px 1px 0px var(--concrete-highlight) inset,
        -1px -1px 0px var(--concrete-shadow) inset,
        0 15px 35px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--concrete-shadow);
      border-radius: 6px;
    }
    .recessed-well {
      background: #111215;
      box-shadow: 
        inset 0 4px 8px rgba(0, 0, 0, 0.5),
        inset 0 1px 3px rgba(0, 0, 0, 0.7),
        0 1px 0px rgba(255, 255, 255, 0.12);
      border-radius: 4px;
    }
    .tactile-button {
      background: linear-gradient(to bottom, #f5f5ee, #dcdcd3);
      border: 1px solid #a3a398;
      border-radius: 4px;
      box-shadow: 
        0 4px 0px #a3a398,
        0 6px 15px rgba(0, 0, 0, 0.1),
        inset 0 1px 0px var(--concrete-highlight);
      transition: all 0.08s ease;
    }
    .tactile-button:active {
      transform: translateY(3px);
      box-shadow: 
        0 1px 0px #a3a398,
        0 2px 4px rgba(0, 0, 0, 0.1),
        inset 0 1px 0px var(--concrete-highlight);
    }
    .led-green {
      background-color: var(--led-green);
      box-shadow: 
        0 0 12px var(--led-green),
        0 0 4px var(--led-green),
        inset 0 1px 1px rgba(255, 255, 255, 0.7);
    }
  </style>
</head>
<body class="min-h-screen flex flex-col">

  <!-- Top bar console -->
  <header class="h-16 flex items-center justify-between px-6 bg-zinc-950 border-b border-zinc-900 text-zinc-300">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded border border-zinc-800">
        <div class="w-2.5 h-2.5 rounded-full led-green"></div>
        <span class="text-[9px] text-zinc-400 font-mono font-bold tracking-widest uppercase">CORE ONLINE</span>
      </div>
      <h1 class="text-xs font-bold font-mono tracking-[0.25em] uppercase">multimux</h1>
    </div>
    <div class="flex items-center gap-6">
      <a href="docs/tutorial.html" class="text-xs font-mono text-zinc-400 hover:text-zinc-200">DOCUMENTATION</a>
      <a href="https://github.com/AMDphreak/multimux" class="text-xs font-mono text-zinc-400 hover:text-zinc-200">GITHUB</a>
    </div>
  </header>

  <!-- Hero Content -->
  <main class="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full text-center">
    
    <div class="concrete-plate p-10 max-w-2xl w-full mb-12 flex flex-col items-center">
      
      <!-- Circular native inlet socket -->
      <div class="w-20 h-20 rounded-full bg-[#d6d6cd] border border-[#b0b0a5] shadow-md flex items-center justify-center mb-6">
        <svg class="w-8 h-8 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>

      <h2 class="text-xl font-bold font-mono text-zinc-800 tracking-wider uppercase mb-3">multimux</h2>
      <p class="text-sm font-mono text-zinc-500 uppercase tracking-widest mb-6">Master Audio Mixdown Suite</p>
      
      <p class="text-sm text-zinc-600 leading-relaxed max-w-lg mb-8">
        Visually mix down multiple discrete audio container tracks into a single master track, while preserving the video stream bit-for-bit with instant, lossless, container-level passthrough. Built natively in Electron + SolidJS, powered by a high-performance concurrent D-lang core.
      </p>

      <!-- Tactical button cluster -->
      <div class="flex gap-4 w-full justify-center">
        <a href="https://github.com/AMDphreak/multimux/releases/latest" class="tactile-button px-8 py-3 text-xs font-mono font-bold tracking-widest uppercase text-zinc-800 flex items-center gap-2">
          <svg class="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Get v${appVersion} Build
        </a>
        <a href="docs/tutorial.html" class="tactile-button px-8 py-3 text-xs font-mono font-bold tracking-widest uppercase text-zinc-700">
          Read the Docs
        </a>
      </div>

    </div>

    <!-- Features Serial Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mb-12">
      <div class="concrete-plate p-6">
        <div class="font-mono text-[10px] text-zinc-400 font-bold uppercase mb-2">// 01 / HIGH PERFORMANCE</div>
        <h4 class="text-sm font-bold font-mono text-zinc-800 uppercase mb-2">D-Lang Concurrency</h4>
        <p class="text-xs text-zinc-600 leading-relaxed">
          Pipes process threads using D's native actor-model message passing, isolating FFmpeg completely to protect Electron from C-level segfaults.
        </p>
      </div>

      <div class="concrete-plate p-6">
        <div class="font-mono text-[10px] text-zinc-400 font-bold uppercase mb-2">// 02 / SCHEDULING</div>
        <h4 class="text-sm font-bold font-mono text-zinc-800 uppercase mb-2">Process Affinity</h4>
        <p class="text-xs text-zinc-600 leading-relaxed">
          Updates background FFmpeg subprocess scheduling to Below Normal, keeping your operating system 100% responsive even under maximum conversion load.
        </p>
      </div>

      <div class="concrete-plate p-6">
        <div class="font-mono text-[10px] text-zinc-400 font-bold uppercase mb-2">// 03 / lossy-free</div>
        <h4 class="text-sm font-bold font-mono text-zinc-800 uppercase mb-2">Lossless Passthrough</h4>
        <p class="text-xs text-zinc-600 leading-relaxed">
          Moves video packets bit-for-bit directly from the input container without transcoding, generating files instantly and preserving 100% original quality.
        </p>
      </div>
    </div>

  </main>

  <footer class="h-16 border-t border-[#b2b2a8] bg-[#dcdcd3] flex items-center justify-between px-6 text-zinc-500 font-mono text-[10px]">
    <span>multimux // Copyright &copy; 2026 amdphreak</span>
    <span>RELEASE: v${appVersion}</span>
  </footer>

</body>
</html>
  `
  fs.writeFileSync(path.join(distDir, 'index.html'), landingPageHtml)
  console.log('✓ Created Custom Skeuomorphic Landing Page at site/dist/index.html')
}

// Compile all AsciiDoc documentation pages
console.log('--- Compiling multimux Documentation Site ---')
buildCustomHomepage()

// Compile main documentation articles
compileAdoc(
  path.join(docsDir, 'tutorial.adoc'),
  path.join(distDocsDir, 'tutorial.html'),
  'Tutorial: Getting Started',
  '..',
  'tutorial'
)
compileAdoc(
  path.join(docsDir, 'how-to.adoc'),
  path.join(distDocsDir, 'how-to.html'),
  'How-To: Thread Scheduling',
  '..',
  'how-to'
)
compileAdoc(
  path.join(docsDir, 'explanation.adoc'),
  path.join(distDocsDir, 'explanation.html'),
  'Explanation: Core Supervisor',
  '..',
  'explanation'
)
compileAdoc(
  path.join(docsDir, 'reference.adoc'),
  path.join(distDocsDir, 'reference.html'),
  'Reference: Command & Schema Spec',
  '..',
  'reference'
)

// Compile root timeline articles
compileAdoc(
  path.join(rootDir, 'CHANGELOG.adoc'),
  path.join(distDir, 'changelog.html'),
  'Changelog Timeline',
  '.',
  'changelog'
)

// Compile changelog-details detailed timeline logs
const detailsFiles = fs.readdirSync(changelogDetailsDir)
for (const file of detailsFiles) {
  if (file.endsWith('.adoc')) {
    const src = path.join(changelogDetailsDir, file)
    const dest = path.join(distChangelogDir, file.replace('.adoc', '.html'))
    // Keep exact naming in detailed HTML compiles
    compileAdoc(src, dest, `Changelog - ${file.replace('.adoc', '')}`, '..', 'changelog')
  }
}

console.log('--- Static Web Site Build Complete! ---')
