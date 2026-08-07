<a id="readme-top"></a>
<div align="center">
  <a href="https://github.com/AMDphreak/multimux/graphs/contributors"><img src="https://img.shields.io/github/contributors/AMDphreak/multimux.svg?style=for-the-badge" alt="Contributors"></a>
  <a href="https://github.com/AMDphreak/multimux/network/members"><img src="https://img.shields.io/github/forks/AMDphreak/multimux.svg?style=for-the-badge" alt="Forks"></a>
  <a href="https://github.com/AMDphreak/multimux/stargazers"><img src="https://img.shields.io/github/stars/AMDphreak/multimux.svg?style=for-the-badge" alt="Stargazers"></a>
  <a href="https://github.com/AMDphreak/multimux/issues"><img src="https://img.shields.io/github/issues/AMDphreak/multimux.svg?style=for-the-badge" alt="Issues"></a>

  <h1>multimux: Master Audio Mixdown Suite</h1>
  <p>A lightweight, cross-platform desktop app (Electron, SolidJS, TypeScript) to visually mix multiple discrete audio tracks from a recording into one master track while preserving video bit-for-bit (<code>-c:v copy</code>).</p>
  <p>
    <a href="https://github.com/AMDphreak/multimux/issues">Report Bug</a>
    &middot;
    <a href="https://github.com/AMDphreak/multimux/issues">Request Feature</a>
  </p>

  <img src="resources/icon.png" alt="multimux Logo" width="128" height="128" />
</div>

<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#explanation">Explanation</a></li>
    <li><a href="#changelog">Changelog</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

## About The Project

Screen-recording apps often capture mic, game, and chat on separate tracks. Players usually only hear track 1. multimux mixes selected tracks with FFmpeg `amix` while copying the video stream losslessly.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* **Desktop** — [![Electron][Electron.com]][Electron-url]
  * [![SolidJS][SolidJS.dev]][SolidJS-url]
  * [![TypeScript][TypeScript.com]][TypeScript-url]
* **Media** — [![FFmpeg][FFmpeg.org]][FFmpeg-url] / FFprobe

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Getting Started

### Prerequisites

* Windows 10/11, macOS, or Linux
* `ffmpeg` and `ffprobe` on PATH
* Node.js + pnpm

### Installation

```bash
pnpm install
pnpm run dev
```

Use `F12` for the developer console if needed.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Usage

### First mixdown

1. Launch multimux.
2. Drag a recording onto the **Inlet Port**.
3. Toggle channels and adjust faders.
4. Click **Mix & Mux Master**.
5. Open the output from the completion overlay.

### Volume (dB)

* Drag faders up to `+6.0 dB` or down to mute.
* Double-click a fader to reset to `0.0 dB`.

### Codecs

Under *Output Mux Specs*, choose **AAC** or **OPUS** and a bitrate (128k–320k).

### Silent video

Mute all channels, then mix — multimux uses FFmpeg `-an`.

### Build scripts

* `pnpm run dev` — hot-reload development
* `pnpm run build` — compile assets
* `pnpm run build:win` — Windows installer under `dist/`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Explanation

Unlike full re-encodes, multimux:

1. **Video stream copy (`-c:v copy`)** — lossless, fast container remux of video packets.
2. **Audio mixdown (`amix`)** — decode selected tracks, apply volume, mix, encode one stereo master.

Example filter graph (CH1 at 1.0, CH3 at 1.5):

```text
[0:a:0]volume=1.0[a0]; [0:a:2]volume=1.5[a2]; [a0][a2]amix=inputs=2:duration=longest:dropout_transition=0[a]
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Changelog

See [CHANGELOG.adoc](CHANGELOG.adoc).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contributing

Fork, branch, and open a pull request.

### Top contributors

<a href="https://github.com/AMDphreak/multimux/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=AMDphreak/multimux" alt="contributors" />
</a>

For per-person profile links, prefer [all-contributors](https://allcontributors.org/).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Contact

Ryan Johnson — [@amdphreak](https://twitter.com/amdphreak)

Project Link: [https://github.com/AMDphreak/multimux](https://github.com/AMDphreak/multimux)

Site: [https://ryanjohnson.dev](https://ryanjohnson.dev)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->
[Electron.com]: https://img.shields.io/badge/Electron-191970?style=for-the-badge&logo=Electron&logoColor=white
[Electron-url]: https://www.electronjs.org/
[SolidJS.dev]: https://img.shields.io/badge/SolidJS-2C4F7C?style=for-the-badge&logo=solid&logoColor=white
[SolidJS-url]: https://www.solidjs.com/
[TypeScript.com]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[FFmpeg.org]: https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white
[FFmpeg-url]: https://ffmpeg.org/
