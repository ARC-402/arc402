# Legacy CLI retired

The root `cli/` package was a historical mirror of the maintained ARC-402 CLI.
It is retired to prevent drift between two package manifests, lockfiles, and
source trees.

Use the maintained package instead:

```bash
cd packages/arc402-cli
npm ci --legacy-peer-deps
npm run build
npm test
```

All new CLI changes must target `packages/arc402-cli`.
