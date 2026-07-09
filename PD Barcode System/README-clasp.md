# Local clasp setup (user-only)

This project is configured for a local (project-level) clasp install.

## 1) Install Node.js (if needed)

Install Node.js LTS from https://nodejs.org

## 2) Install project dependencies

From this folder:

```powershell
npm install
```

## 3) Authenticate once

```powershell
npx clasp login
```

## 4) Push this project

```powershell
npm run clasp:push
```

## Other useful commands

```powershell
npm run clasp:status
npm run clasp:pull
```
