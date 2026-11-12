# Release

How `.github/workflows/release.yml` builds and attaches release assets, and why.

## Jobs

The workflow runs on a created release or by hand with a tag (`workflow_dispatch`). It has four jobs:

1. `prepare`: checks the tag name, creates the tag and a draft release when they are missing, links the draft to the tag, and outputs the tag's commit SHA. The other jobs check out this SHA, so they all build the same commit even if the tag or a branch moves during the run.
2. `contents`: runs `tools/build.sh <tag>` and attaches the archives it writes, `assets-<tag>.{zip,7z,tar.gz,tar.xz}`.
3. `fonts`: attaches every font in `fonts/` as one collection, `font.ttc` and `font.woff2`.
4. `publish`: publishes the draft. It needs both `contents` and `fonts`, so a failed run leaves a draft instead of a published release with missing assets.

`contents` and `fonts` run in parallel. Before they were split, they ran one after another in one job, and the font collection (`woff2_compress` needs about 9 GB of memory, and the font step took about 50 minutes in a recent run) made the run long. Each job also gets its own runner disk. `fonts` uses a sparse checkout (`fonts/` and `.github/scripts/`), since it does not need `images/` or `sounds/`.

`.github/scripts/upload.sh` is shared by both jobs. It refuses files of 2 GiB or more (GitHub's asset limit, `ASSET_SIZE_LIMIT`) and removes each file after uploading it to keep disk usage low.

## tools/build.sh

`tools/build.sh [VERSION]` builds the contents of a release, locally as in CI, into `dist/` (`-o` changes it, `dist/` is ignored by git):

- `dist/assets-VERSION/`: the files tracked by git in `README.md`, `fonts/`, `images/`, `scripts/`, `sounds/` and `styles/`, plus `script.js` and `style.css`.
- `dist/assets-VERSION.{zip,7z,tar.gz,tar.xz}`: archives of that directory. `-f` selects the formats (for example `-f zip`, or `-f none` for the directory only).

`VERSION` defaults to `git describe --tags --always --dirty`. The workflow passes the tag. Earlier, the staging and the archives were written inline in the workflow; they were moved into the script so that a release can be built and checked locally, and the workflow only installs tools and uploads.

- Required tools: esbuild, zip, 7-Zip, gzip, xz and tar (GNU tar or bsdtar). `ESBUILD` and `SEVENZIP` select the esbuild and 7-Zip executables, as a command name or a path (not a command with arguments such as `npx esbuild`). Without `SEVENZIP`, `7z` is used, or `7zz` (the name used by Homebrew's `sevenzip`) when `7z` is not found.
- Only tracked files are taken, so files such as `.DS_Store` or unfinished untracked files are not included; files that are staged but not committed are included with their current content. Files are hard-linked into the directory instead of copied (copied when linking fails, such as across file systems), so nothing in the directory may be modified in place.
- Archivers run with `LC_ALL=C.UTF-8`, so non-ASCII file names (in `images/`) are stored as UTF-8. The script stops if that locale is missing.
- The tar is written once, with entries sorted by name and owners set to 0, and compressed into each tar format. It is not piped into the compressor, because POSIX sh has no `pipefail` and a failing tar would be hidden.
- Existing `dist/assets-VERSION/` and `dist/assets-VERSION.*` are removed first, so files deleted from the repository do not remain from an earlier build.
- The archives are about 0.5 GB (7z, tar.xz) and 1.25 GB (zip, tar.gz) each, so `dist/` needs about 5 GB with the directory.

## script.js and style.css

`script.js` and `style.css` are bundled by esbuild from the entry files `scripts/index.js` and `styles/index.css`.

- To add a script or a stylesheet to the bundle, add it to the entry file. The order in the entry file is the order in the bundle: `initializer.js` comes first because it defines `window.nercone`, and in CSS the base files come before the components (utilities rely on this, see `components.md`). `noscript.css` is only for `<noscript>` and is not in the entry.
- The entry files also work without a build: `<link rel="stylesheet" href="styles/index.css">` and `<script type="module" src="scripts/index.js">`. Module scripts are deferred, need CORS headers when loaded from another origin, and do not load over `file://`; `script.js` has none of these limits.
- `script.js` is an IIFE (`--format=iife`), so it is still loaded with a plain `<script src>`. Scripts may use `import`/`export` between each other; esbuild resolves them, and a file imported from several places is included once.
- In CSS, `@charset` and external `@import` rules (such as a web font stylesheet) are moved to the top of `style.css`, where CSS requires them. Local `@import` rules are inlined where they are written, and conditions such as `layer(...)` or media queries are kept.
- esbuild prints the CSS and JS again in its own format (indentation, quotes, number notation), without changing what they mean. A comment with the source path precedes each file. The output is not minified.

### Why a bundler

The files were first concatenated in the workflow. That broke any rule that must be at the start of a file: `@import` (allowed only after `@charset` and `@layer` statements), `@charset`, `@namespace`, and JavaScript `import`, which is not allowed in a classic script at all and would need its bindings resolved across files. Doing this correctly means parsing CSS and JS and resolving modules, which is what a bundler does, so esbuild is used instead of a hand-written tool. esbuild is a single binary, needs no configuration file, and keeps the output readable when not minifying.

### Why entry files

Earlier, every file under `styles/` and `scripts/` was found with `find` and ordered by depth and path. With `@import`, that no longer works: a file imported by another one is also found on its own, and CSS uses the last occurrence of a duplicate import, so the imported file moved to a different place in the cascade. Excluding imported files by a naming rule (such as a leading `_`, as in Sass) was also considered, but an explicit entry states both the contents and the order, works in a browser without a build, and does not depend on file names.

### Installing esbuild

The workflow installs an exact version (`ESBUILD_VERSION`) with `npm install --ignore-scripts` into `$RUNNER_TEMP`, so the repository has no `package.json` or `node_modules`. The `bin/esbuild` shim finds and runs the binary of the platform package (`@esbuild/linux-x64`), which npm installs as an optional dependency, so esbuild's install script is skipped. That script verifies the binary, replaces the shim with the binary to skip starting node, and downloads the platform package when optional dependencies were not installed; none of these is needed here.
