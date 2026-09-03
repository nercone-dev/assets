#!/bin/sh
# NOTE: Written by LLM

set -u

progname=${0##*/}

usage() {
	cat <<EOF
Usage: $progname [options] [path ...]

Options:
  -d, --distance NUM
  -e, --effort NUM
  -f, --force
  -n, --dry-run
  -v, --verbose
  -L, --follow
  -m, --no-mtime
  -x, --extra "ARGS"
  -h, --help

Examples:
  $progname
  $progname -e 9 ~/pictures
  $progname -n
EOF
}

err() {
	printf '%s: %s\n' "$progname" "$*" >&2
}

distance=0
effort=7
force=0
dryrun=0
verbose=0
follow=0
keep_mtime=1
extra=

while [ $# -gt 0 ]; do
	case $1 in
		-d | --distance)
			[ $# -ge 2 ] || { err "value is needed for $1"; exit 2; }
			distance=$2
			shift 2
			;;
		--distance=*)
			distance=${1#*=}
			shift
			;;
		-e | --effort)
			[ $# -ge 2 ] || { err "value is needed for $1"; exit 2; }
			effort=$2
			shift 2
			;;
		--effort=*)
			effort=${1#*=}
			shift
			;;
		-x | --extra)
			[ $# -ge 2 ] || { err "value is needed for $1"; exit 2; }
			extra=$2
			shift 2
			;;
		--extra=*)
			extra=${1#*=}
			shift
			;;
		-f | --force)   force=1;      shift ;;
		-n | --dry-run) dryrun=1;     shift ;;
		-v | --verbose) verbose=1;    shift ;;
		-L | --follow)  follow=1;     shift ;;
		-m | --no-mtime) keep_mtime=0; shift ;;
		-h | --help)    usage; exit 0 ;;
		--) shift; break ;;
		-*) err "unknown option: $1"; usage >&2; exit 2 ;;
		*) break ;;
	esac
done

case $distance in
	'' | *[!0-9.]* | *.*.*) err "invaild -d value: $distance"; exit 2 ;;
esac
case $effort in
	'' | *[!0-9]*) err "invaild -e value: $effort"; exit 2 ;;
esac

if [ $# -eq 0 ]; then
	set -- .
fi

for target in "$@"; do
	if [ ! -e "$target" ]; then
		err "not found: $target"
		exit 2
	fi
done

if [ "$dryrun" -eq 0 ] && ! command -v cjxl >/dev/null 2>&1; then
	err "cjxl not found"
	exit 127
fi

statdir=$(mktemp -d "${TMPDIR:-/tmp}/png2jxl.XXXXXX") || exit 1
cleanup() { rm -rf "$statdir"; }
trap 'cleanup' EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap 'cleanup; exit 129' HUP

worker='
tmp=
trap "rm -f \"\$tmp\"; exit 130" INT TERM HUP

for src in "$@"; do
	dst="${src%.*}.jxl"

	if [ -e "$dst" ] && [ "$P2J_FORCE" -eq 0 ]; then
		printf "skip: %s (already present)\n" "$dst"
		printf "x\n" >> "$P2J_STAT/skip"
		continue
	fi

	if [ "$P2J_DRYRUN" -eq 1 ]; then
		printf "dry : %s -> %s\n" "$src" "$dst"
		printf "x\n" >> "$P2J_STAT/dry"
		continue
	fi

	tmp="$dst.part.$$"

	if [ "$P2J_VERBOSE" -eq 1 ]; then
		cjxl -d "$P2J_DIST" -e "$P2J_EFFORT" $P2J_EXTRA "$src" "$tmp"
		rc=$?
		msg=
	else
		msg=$(cjxl -d "$P2J_DIST" -e "$P2J_EFFORT" $P2J_EXTRA "$src" "$tmp" 2>&1)
		rc=$?
	fi

	if [ "$rc" -ne 0 ] || [ ! -s "$tmp" ]; then
		rm -f "$tmp"
		printf "FAIL: %s (cjxl exit=%s)\n" "$src" "$rc" >&2
		[ -n "$msg" ] && printf "%s\n" "$msg" >&2
		printf "x\n" >> "$P2J_STAT/fail"
		continue
	fi

	if ! mv -f "$tmp" "$dst"; then
		rm -f "$tmp"
		printf "FAIL: %s (failed to execute mv)\n" "$src" >&2
		printf "x\n" >> "$P2J_STAT/fail"
		continue
	fi

	[ "$P2J_MTIME" -eq 1 ] && touch -r "$src" "$dst" 2>/dev/null

	sbytes=$(wc -c < "$src")
	dbytes=$(wc -c < "$dst")
	printf "%s %s\n" "$sbytes" "$dbytes" >> "$P2J_STAT/ok"
	printf "ok  : %s -> %s\n" "$src" "$dst"
done

exit 0
'

P2J_DIST=$distance
P2J_EFFORT=$effort
P2J_EXTRA=$extra
P2J_FORCE=$force
P2J_DRYRUN=$dryrun
P2J_VERBOSE=$verbose
P2J_MTIME=$keep_mtime
P2J_STAT=$statdir
export P2J_DIST P2J_EFFORT P2J_EXTRA P2J_FORCE P2J_DRYRUN P2J_VERBOSE P2J_MTIME P2J_STAT

# ------------------------------------------------------------------------ 実行

if [ "$follow" -eq 1 ]; then
	find -L "$@" -type f -iname '*.png' -exec sh -c "$worker" sh {} +
else
	find "$@" -type f -iname '*.png' -exec sh -c "$worker" sh {} +
fi
find_rc=$?

# ------------------------------------------------------------------------ 集計

count_lines() {
	if [ -f "$1" ]; then
		wc -l < "$1" | tr -d ' '
	else
		printf '0\n'
	fi
}

n_ok=$(count_lines "$statdir/ok")
n_dry=$(count_lines "$statdir/dry")
n_skip=$(count_lines "$statdir/skip")
n_fail=$(count_lines "$statdir/fail")

printf '\n----\n'
if [ "$dryrun" -eq 1 ]; then
	printf 'to Convert: %s / Skip: %s (dry-run)\n' "$n_dry" "$n_skip"
else
	printf 'Converted: %s / Skip: %s / Failed: %s\n' "$n_ok" "$n_skip" "$n_fail"
	if [ "$n_ok" -gt 0 ]; then
		awk '
		     function human(b,   u, i) {
		         split("B KiB MiB GiB TiB", u, " ")
		         i = 1
		         while (b >= 1024 && i < 5) { b /= 1024; i++ }
		         return sprintf("%.1f %s", b, u[i])
		     }
		     { s += $1; d += $2 }
		     END {
		         if (s > 0)
		             printf "Size: %s -> %s (%.1f%%)\n", human(s), human(d), d * 100 / s
		     }' "$statdir/ok"
	fi
fi

if [ "$n_fail" -gt 0 ]; then
	exit 1
fi
exit "$find_rc"
