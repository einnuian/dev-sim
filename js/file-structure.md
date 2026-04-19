# File Structure (Canvas)

Keep this document (docs/file-structure.md) up to date whenever the project structure changes.

```
.
├── index.html              # Entry HTML, mounts full-screen canvas
├── build.sh                # One-click build: installs deps if missing, builds, copies public to dist
├── .gitignore              # Ignore node_modules / dist / .DS_Store
├── package.json            # Vite scripts and dependencies
├── public/
│   └── assets/
│       └── game_config.json# Runtime config placeholder (currently empty)
├── src/
│   ├── core/               # Base context/init utilities
│   ├── system/             # System utilities (size/DPR adaptation)
│   ├── loop/               # Render loop creation
│   ├── draw/               # Drawing functions
│   ├── main.js             # App composition entry
│   └── styles.css          # Global styles and background
└── docs/                   # Project docs (keep this file updated when structure changes)
```

File responsibilities:
- `index.html`: Mounts the full-screen canvas and loads the entry script.
- `build.sh`: Installs dependencies if needed, runs the production build, and copies `public/` assets into `dist/`.
- `.gitignore`: Ignores dependencies and build artifacts.
- `package.json`: Declares Vite scripts and dependencies.
- `public/assets/game_config.json`: Placeholder runtime config.
- `src/main.js`: Entry assembly; creates context, handles size/DPR, starts the render loop, calls draw functions.
- `src/core/createCanvasContext.js`: Retrieves and validates the canvas and 2D context.
- `src/system/createResizer.js`: Manages viewport size and DPR scaling; exposes `viewport`.
- `src/loop/createRenderLoop.js`: Wraps rAF and provides `delta`/`timestamp`.
- `src/draw/drawBackground.js`: Renders the linear gradient background.
- `src/draw/drawPlaceholderSquare.js`: Placeholder demo; renders a centered gradient square with rotation. Replace with your game content.
- `src/styles.css`: Full-screen background, layout, and canvas sizing styles.
- `docs/developer.md`: Developer guide (stack, conventions, recipes).
- `docs/designer.md`: Design direction and tunable options.
- `docs/file-structure.md`: Directory and responsibility guide (update when structure changes).
