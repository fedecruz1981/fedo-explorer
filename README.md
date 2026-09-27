# fedo~explorer

> Explorador de archivos de audio con reproducción integrada, metadata técnica y waveform. Hecho con Electron + React + Vite.

**fedo~explorer** es un explorador de archivos de audio para escritorio que permite navegar tus carpetas, reproducir cualquier archivo compatible sin abrirlo en otro programa, y ver al instante su metadata técnica (duración, codec, bitrate, sample rate, canales) junto con la forma de onda del audio.

Escrito por **Federico Cruz (fedo~sound)** — una herramienta pensada para técnicos de sonido y músicos que trabajan con muchas carpetas de audio.

> 🔜 Se agrega una captura de pantalla en una próxima versión.

## Características

- 📂 **Explorador de carpetas**: sidebar con accesos rápidos (Home, Escritorio, Documentos, Descargas, Música) y todos los discos disponibles
- 🔊 **Reproducción integrada**: streaming por un protocolo propio (`fedo-media://`) con soporte **HTTP Range** (seek real en archivos largos)
- 🎚️ **Transporte completo**: play/pausa, seek sobre el waveform, volumen, atajos de teclado (Espacio, Supr)
- 📊 **Metadata técnica** vía `music-metadata`: duración, contenedor, codec, bitrate, sample rate y canales
- 🌊 **Waveform** calculado en segundo plano y cacheado por archivo
- 🗑️ **Borrado a papelera** del sistema (no destruye archivos)
- ⚡ Conteo de audio **recursivo** por carpeta, con corte de seguridad a 20.000 archivos
- 🔒 Seguridad: `contextIsolation` + `nodeIntegration: false`, API expuesta vía bridge tipado

## Formatos soportados

`mp3` `wav` `flac` `ogg` `oga` `m4a` `aac` `aiff` `aif` `wma` `opus` `webm` `mka` `mpc` `ape` `amr` `caf`

## Roadmap (fase 2)

- ⏱️ **BPM** — detección de tempo por carpeta (placeholder actual)
- 🔊 **LUFS** — medición de loudness integrado (EBU R128) con filtro ebur128
- 🖼️ Captura de pantalla y demo instalable

## Cómo ejecutarlo

```bash
npm install       # instala dependencias
npm run dev       # desarrollo (Vite + Electron con hot reload)
npm run build     # compila el renderer a ./dist
npm run start     # compila y abre la app
```

Para generar instaladores:

```bash
npm run pack      # build de la carpeta de la app
npm run dist      # instalador (NSIS / dmg / AppImage)
```

## Estructura

```text
/
├── electron/
│   ├── main.js           # proceso principal: IPC, protocolo de streaming, filesystem
│   └── preload.js        # puente seguro window.fedo
├── src/
│   ├── App.jsx           # orquestación: árbol, tabla, transporte, borrado
│   ├── components/       # Sidebar, FileTable, TransportBar, Waveform
│   ├── lib/              # peaks (decodificación) y format (utilidades)
│   └── styles.css
├── vite.config.js
└── package.json
```

## Stack

`Electron` · `React` · `Vite` · `music-metadata` · `lucide-react` · JSX moderno

## Licencia

[MIT](./LICENSE)