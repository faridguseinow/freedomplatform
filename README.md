# Freedom Platform

Vite + React + TypeScript application for the Freedom Platform POS/admin workspace.

## Project Root

Open this folder in VS Code:

```bash
Freedom-Platform
```

The app is no longer inside a nested `freedom-platform/` folder. Run all commands from the repository root.

## Setup

```bash
npm install
```

Create local environment values in `.env.local` using `.env.example` as a reference.

## Development

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173/
```

## Checks

```bash
npm run lint
npm run build
```

## Main Folders

- `src/` - application source code
- `src/features/` - business features by domain
- `src/app/` - routing, layouts, providers
- `src/components/` - shared UI/common components
- `supabase/` - database migrations, functions, seeds and tests
- `docs/` - technical documentation
- `public/` - static assets
- `scripts/` - project scripts
