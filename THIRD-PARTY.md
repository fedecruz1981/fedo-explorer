# Licencias de terceros

**fedo~explorer** es software propio, distribuido bajo licencia MIT (ver [`LICENSE`](./LICENSE)).
Este documento detalla los componentes de terceros que usa y con qué licencia se distribuye cada
uno.

> Documento informativo; no es asesoramiento legal.

## 1. Incluidos en el instalador

### Runtime de Electron

| Componente | Versión | Licencia |
|---|---|---|
| [Electron](https://github.com/electron/electron) | 44.x | MIT |
| Chromium (incluido en Electron) | — | BSD-3-Clause y otras licencias libres |
| Node.js (incluido en Electron) | — | MIT |

El runtime de Electron trae sus propios avisos (`LICENSE` y `LICENSES.chromium.html`), que
Chromium exige conservar al redistribuir.

### Dependencias incluidas en la aplicación

| Componente | Versión | Licencia | Uso |
|---|---|---|---|
| [React](https://react.dev) / [React DOM](https://react.dev) | 18.3.1 | MIT | Interfaz |
| [music-metadata](https://github.com/Borewit/music-metadata) | 11.x | MIT | Lectura de metadatos (ID3 / Vorbis) |
| [lucide-react](https://lucide.dev) | 0.400.x | ISC | Iconos |
| [@fontsource/chakra-petch](https://fontsource.org/fonts/chakra-petch) | 5.x | OFL-1.1 | Tipografía (Chakra Petch) |
| [@fontsource/jetbrains-mono](https://fontsource.org/fonts/jetbrains-mono) | 5.x | OFL-1.1 | Tipografía (JetBrains Mono) |

Las tipografías se distribuyen bajo la **SIL Open Font License 1.1**, que permite usarlas y
redistribuirlas dentro de la aplicación; no se pueden vender por separado.

### Herramientas de desarrollo (no entran en el instalador)

| Componente | Versión | Licencia |
|---|---|---|
| Vite | 8.x | MIT |
| TypeScript | 7.x | Apache-2.0 |
| Vitest | 5.x | MIT |
| ESLint y plugins (`@eslint/js`, `eslint-plugin-react-hooks`, `globals`) | — | MIT |
| electron-builder | 26.x | MIT |
| Playwright (`@playwright/test`) | 1.63 | Apache-2.0 |
| `@vitejs/plugin-react`, `concurrently`, `cross-env`, `wait-on` | — | MIT |

## 2. Componentes del sistema

fedo~explorer **no** redistribuye binarios de terceros: decodifica audio con la Web Audio API de
Chromium (ya incluida en Electron) y lee metadatos con `music-metadata` (JavaScript puro). No
requiere FFmpeg, Python ni ningún runtime externo.

## 3. Cómo regenerar esta lista

```powershell
npm ls --depth=0
npx license-checker --direct
```

Última verificación: 2026-10-17.
