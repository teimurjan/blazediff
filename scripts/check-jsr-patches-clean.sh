#!/usr/bin/env bash
# Abort a commit if any packages/*/jsr.patch is currently applied to
# the working tree. `patch --dry-run -N` (forward, no-reverse) exits 0
# when the patch would apply cleanly — i.e., the source is unpatched —
# and exits non-zero when it sees the patch is already applied. We
# want committed source to always be in the unpatched state.
set -eu

failed=0
for patch_file in packages/*/jsr.patch; do
	[ -f "$patch_file" ] || continue
	pkg_dir=$(dirname "$patch_file")
	if ! (cd "$pkg_dir" && patch -p1 --dry-run -N --silent -i jsr.patch) >/dev/null 2>&1; then
		printf 'error: %s is currently applied — revert before committing:\n' "$patch_file" >&2
		printf '       (cd %s && patch -p1 -R -i jsr.patch)\n' "$pkg_dir" >&2
		failed=1
	fi
done
exit "$failed"
