# Yoridokoro

Yoridokoro is a private-first Electron application for studying, planning focused sessions, tracking objectives, reflecting on learning, and maintaining a personal art collection.

The product reference in [`Software.txt`](./Software.txt) documents the current behavior in detail and clearly separates implemented features from ideas under consideration.

## Development

Requirements: Node.js and npm on Windows, macOS, or Linux.

```sh
npm install
npm run dev
```

## Verification

```sh
npm run verify
```

This runs TypeScript checks, the automated test suite, and the production build.

## Packaging

```sh
npm run dist
```

Generated builds and installers are written to `release/` and are intentionally excluded from Git.

## Personal data

Application databases, exports, credentials, caches, and local backups must never be committed. The repository ignore rules exclude common forms of those files. Catalogue API credentials are entered locally by the user and stored in the application profile, not in source control.
