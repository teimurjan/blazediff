#!/usr/bin/env bash
# Keep build artifacts out of commits. Every release binary - the .node files,
# the per-platform CLIs, the wasm module, the wheels - is built and committed by
# .github/workflows/build-artifacts.yml (comment `/build` on the PR), so a local
# `git add` of one only ever lands a machine-specific build that CI will
# overwrite, at the cost of a permanent LFS object.
#
# Assets are deliberately allowed: fixtures are half of this repo's test suite.
# Only compiled output is rejected.
#
# When committing artifacts by hand is the intent - the documented fallback for
# when CI can't build them - bypass with `git commit --no-verify`.
#
# Reads the staged set itself rather than taking filenames, so that
# `prek run --all-files` doesn't re-flag the artifacts already in the tree.
set -eu

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -n "$staged" ] || exit 0

# Anything .gitattributes routes through Git LFS is a release artifact here, by
# construction. Reading it from git keeps this in step with new platform
# packages, and catches pointer files, which magic bytes can't.
lfs_tracked=$(printf '%s\n' "$staged" | git check-attr --stdin filter | sed -n 's/: filter: lfs$//p')

is_compiled() {
	case "$1" in
		*.node|*.wasm|*.whl|*.exe|*.dll|*.dylib|*.so|*.so.*|*.a|*.lib|*.o|*.obj|*.pdb|*.rlib)
			return 0 ;;
		# Everything else carrying a suffix is source or an asset.
		*.*)
			return 1 ;;
	esac

	# Extension-less build output - the `blazediff` CLIs, a stray a.out -
	# identified the only way it can be, by magic number.
	case "$(head -c 4 "$1" | od -An -tx1 | tr -d ' \n')" in
		7f454c46) return 0 ;;                                     # ELF
		feedface|feedfacf|cefaedfe|cffaedfe|cafebabe) return 0 ;;  # Mach-O, incl. universal
		0061736d) return 0 ;;                                     # wasm
		4d5a*) return 0 ;;                                        # PE
	esac
	return 1
}

blocked=""
while IFS= read -r file; do
	[ -f "$file" ] || continue
	if printf '%s\n' "$lfs_tracked" | grep -qxF "$file" || is_compiled "$file"; then
		blocked="${blocked}       ${file}
"
	fi
done <<EOF
$staged
EOF

if [ -n "$blocked" ]; then
	printf 'error: build artifacts must not be committed:\n' >&2
	printf '%s' "$blocked" >&2
	printf '       Comment "/build" on the PR and CI will build and push them.\n' >&2
	printf '       To commit them by hand anyway: git commit --no-verify\n' >&2
	exit 1
fi
