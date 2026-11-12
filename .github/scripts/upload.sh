#!/bin/sh
# Usage: upload.sh FILE ...
# Checks each FILE against the release asset size limit, attaches it to release $TAG, then removes it to free disk space.
# Environment: TAG, ASSET_SIZE_LIMIT, GH_TOKEN, GH_REPO

set -eu

for file in "$@"; do
	name=${file##*/}
	size=$(wc -c < "$file" | tr -d " ")
	echo "$name: $size bytes"
	if [ "$size" -ge "$ASSET_SIZE_LIMIT" ]; then
		echo "::error::$name is $size bytes, over the release asset limit ($ASSET_SIZE_LIMIT bytes)"
		exit 1
	fi
	gh release upload "$TAG" "$file" --clobber
	rm -f "$file"
done
