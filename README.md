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

**Production:**
```bash
docker-compose up strata-paint-prod
```

### Using Docker directly

**Build the image:**
```bash
docker build -t strata-paint .
```

**Run the container:**
```bash
docker run -p 80:80 strata-paint
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
