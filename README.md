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
