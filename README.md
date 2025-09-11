# StrataPaint

Open source HueForge alternative built with React, TypeScript, and Vite.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker (optional)

### Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/vycdev/StrataPaint.git
   cd StrataPaint
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5173`

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Preview Production Build

```bash
npm run preview
```

## 🐳 Docker

### Using Docker Compose (Recommended)

**Development:**
```bash
docker-compose up strata-paint-dev
```
Access at `http://localhost:5173`

**Production (automatic build):**
```bash
docker-compose up strata-paint-prod
```
Access at `http://localhost:80`

**Production (manual build - fastest):**
```bash
npm run build
docker-compose up strata-paint-manual
```
Access at `http://localhost:80`

### Using Docker directly

**For production (manual build):**
```bash
npm run build
docker build -t strata-paint --target manual .
docker run -p 80:80 strata-paint
```

**For production (automatic build):**
```bash
docker build -t strata-paint --target production .
docker run -p 80:80 strata-paint
```

**For development:**
```bash
docker build -t strata-paint-dev --target development .
docker run -p 5173:5173 -v $(pwd):/app -v /app/node_modules strata-paint-dev
```

## 🛠️ Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **ESLint** - Code linting
- **Docker** - Containerization
- **Nginx** - Production web server

## 📝 Project Structure

```
├── src/               # Source files
├── public/            # Static assets
├── dist/              # Built application
├── Dockerfile         # Docker configuration
├── docker-compose.yml # Docker Compose setup
└── package.json       # Dependencies and scripts
```

## 🧭 Project Plan (Roadmap)

This project aims to be an open-source browser-based alternative to HueForge. High-level features and immediate roadmap:

- Image upload and preview (current): let users upload or drag-and-drop an image and preview it in the browser.
- Color reduction: apply a filter to reduce the image to N colors; user-selectable N.
- Color pickers: allow users to tweak/replace the generated palette colors.
- Layer heights: per-color layer height and a base layer height that the user can set.
- Ordering: drag/drop or controls to reorder colors (which affects layering order in the 3D model).
- Preview: show a live preview of the filtered image and the stacked layers view.
- STL export: generate a simple stacked 3D model and export as an STL file.
- Print instructions: output a short textual instruction list for the 3D printer (layer heights, color change layers, etc.).
- Persistence (future): localStorage/IndexedDB save for images and settings, plus optional project import/export.
- Future features: more advanced color quantization algorithms, palette auto-optimization, multilayer blending modes, and per-color infill settings.

If you'd like, we'll continue by implementing the color reduction UI next (selector for number of colors) and a CPU-based quantization pipeline in JS.

