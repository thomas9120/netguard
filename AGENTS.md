# Agent notes

pi-netguard is a pi extension published to npm as `pi-netguard`. Users install it with `pi install npm:pi-netguard`, and the `pi-package` keyword lists it in the [pi package gallery](https://pi.dev/packages).

## Checks

```sh
npm run check   # typecheck + tests
```

## Releasing a new version

1. Commit all changes. `npm version` refuses to run with a dirty working tree.
2. Bump the version. This updates `package.json` and `package-lock.json`, commits, and creates a `vX.Y.Z` tag:
   ```sh
   npm version patch   # bug fixes
   npm version minor   # new detections or features
   npm version major   # breaking changes
   ```
3. Publish. `prepublishOnly` runs `npm run check` first and aborts on failure:
   ```sh
   npm publish
   ```
   This requires `npm login` with the package owner's account.
4. Push the release commit and tag:
   ```sh
   git push --follow-tags
   ```

Users on an unpinned install pick up the release with `pi update --extensions`.

Only `src`, `README.md` and `LICENSE` are published (see `files` in `package.json`). Check the tarball with `npm pack --dry-run` after adding files that must ship.
