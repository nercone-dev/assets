#!/bin/sh
# Builds the release contents: a directory with the repository's files, script.js and style.css, and its archives.

set -eu

progname=${0##*/}

# Top-level paths of the repository that are included.
contents='README.md fonts images scripts sounds styles'
all_formats='zip,7z,tar.gz,tar.xz'

usage() {
	cat <<EOF
Usage: $progname [options] [VERSION]

Writes OUTDIR/assets-VERSION/ and OUTDIR/assets-VERSION.{zip,7z,tar.gz,tar.xz}.
assets-VERSION/ holds the files tracked by git in: $contents
plus script.js and style.css, bundled from scripts/index.js and styles/index.css.
VERSION defaults to the output of \`git describe --tags --always --dirty\`.

Options:
  -o, --output DIR     output directory (default: dist)
  -f, --formats LIST   comma-separated archive formats: $all_formats (default: all),
                       or "none" for the directory only
  -h, --help

Environment:
  ESBUILD   esbuild executable: a command name or a path (default: esbuild)
  SEVENZIP  7-Zip executable: a command name or a path (default: 7z, or 7zz if 7z is not found)
EOF
}

err() {
	printf '%s: %s\n' "$progname" "$*" >&2
}

# abspath PATH: prints PATH as an absolute path if it contains a slash; a command name is printed as is.
abspath() {
	case $1 in
		/*) printf '%s\n' "$1" ;;
		*/*) printf '%s\n' "$(pwd)/$1" ;;
		*) printf '%s\n' "$1" ;;
	esac
}

outdir=dist
formats=$all_formats

while [ $# -gt 0 ]; do
	case $1 in
		-o | --output)
			[ $# -ge 2 ] || { err "value is needed for $1"; exit 2; }
			outdir=$2
			shift 2
			;;
		--output=*)
			outdir=${1#*=}
			shift
			;;
		-f | --formats)
			[ $# -ge 2 ] || { err "value is needed for $1"; exit 2; }
			formats=$2
			shift 2
			;;
		--formats=*)
			formats=${1#*=}
			shift
			;;
		-h | --help) usage; exit 0 ;;
		--) shift; break ;;
		-*) err "unknown option: $1"; usage >&2; exit 2 ;;
		*) break ;;
	esac
done
[ $# -le 1 ] || { usage >&2; exit 2; }

[ "$formats" = none ] && formats=
for format in $(printf '%s' "$formats" | tr ',' ' '); do
	case ,$all_formats, in
		*,"$format",*) ;;
		*) err "unknown format: $format"; exit 2 ;;
	esac
done

# Relative paths are resolved before changing to the repository root.
esbuild=$(abspath "${ESBUILD:-esbuild}")
if [ -n "${SEVENZIP:-}" ]; then
	sevenzip=$(abspath "$SEVENZIP")
elif command -v 7z > /dev/null 2>&1; then
	sevenzip=7z
else
	sevenzip=7zz
fi
mkdir -p "$outdir"
outdir=$(cd "$outdir" && pwd)

cd "$(dirname "$0")/.."

version=${1:-$(git describe --tags --always --dirty)}
case $version in
	'' | -* | *[!A-Za-z0-9._+-]*) err "unsupported version: '$version' (allowed: A-Z a-z 0-9 . _ + -, not starting with -)"; exit 2 ;;
esac

# UTF-8, so that the archivers store non-ASCII file names (in images/) correctly.
export LC_ALL=C.UTF-8
[ "$(locale charmap)" = UTF-8 ] || { err "the C.UTF-8 locale is not available"; exit 1; }

name=assets-$version
stage=$outdir/$name
rm -rf "$stage" "$outdir/$name".*
mkdir -p "$stage"

# Only files tracked by git are included, so files such as .DS_Store are left out.
# Hard links: the files are not modified, so they are not copied (copied when linking fails).
# git quotes names with characters such as '"' or a newline even with core.quotePath=false; those are not supported.
# The list is read before the loop, so that a failure of git stops the build (POSIX sh has no pipefail).
files=$(git -c core.quotePath=false ls-files -- $contents)
[ -n "$files" ] || { err "no files found"; exit 1; }
printf '%s\n' "$files" | while IFS= read -r path; do
	case $path in
		'"'*) err "unsupported file name: $path"; exit 1 ;;
	esac
	mkdir -p "$stage/$(dirname "$path")"
	ln "$path" "$stage/$path" 2> /dev/null || cp -p "$path" "$stage/$path"
done

# --charset=utf8 keeps non-ASCII text as is instead of escaping it.
# --format=iife keeps script.js a classic script, loaded with <script src> as before.
"$esbuild" scripts/index.js --bundle --format=iife --charset=utf8 --log-level=warning --outfile="$stage/script.js"
"$esbuild" styles/index.css --bundle --charset=utf8 --log-level=warning --outfile="$stage/style.css"

cd "$outdir"

# tar FILE: writes an uncompressed tar of $name with sorted entries and no owner names, so it does not depend on
# the file system's order or the local users. GNU tar and bsdtar (macOS) take different owner options.
tar_create() {
	if tar --version 2> /dev/null | grep -q 'GNU tar'; then
		owner='--owner=0 --group=0 --numeric-owner'
	else
		owner='--uid 0 --gid 0 --uname root --gname root --numeric-owner'
	fi
	find "$name" | LC_ALL=C sort | tar -cf "$1" $owner --no-recursion -T -
	# A failure of tar in the pipeline above is not reported (POSIX sh has no pipefail), so the result is checked.
	[ -s "$1" ] || { err "tar did not write $1"; return 1; }
}

# The tar is written once and compressed into each tar format, then removed.
tar=
for format in $(printf '%s' "$formats" | tr ',' ' '); do
	file=$name.$format
	echo "$file"
	case $format in
		zip) zip -q -r -9 "$file" "$name" ;;
		7z) "$sevenzip" a -bd -t7z -mx=9 -mmt=on "$file" "$name" > /dev/null ;;
		tar.*)
			[ -n "$tar" ] || { tar=$name.tar; tar_create "$tar"; }
			case $format in
				tar.gz) gzip -9 -n -c "$tar" > "$file" ;;
				tar.xz) xz -9 -T0 -c "$tar" > "$file" ;;
			esac
			;;
	esac
done
[ -z "$tar" ] || rm -f "$tar"

ls -l "$outdir"
