#!/usr/bin/env bash
# Benchmark the pushed HEAD on a Google Cloud VM, copy benchmarks/ back into
# this checkout, then delete the VM.
#
# Usage: gcp.sh [--keys a,b] [--on-demand] [-- args forwarded to pnpm benchmark]
# Env:   GCP_PROJECT, GCP_ZONE, GCP_MACHINE_TYPE, GCP_CPU_PLATFORM

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

PROJECT="${GCP_PROJECT:-$(gcloud config get project 2>/dev/null)}"
ZONE="${GCP_ZONE:-us-central1-b}"
MACHINE_TYPE="${GCP_MACHINE_TYPE:-c4-standard-16}"
# A minimum, not an exact match: a lower value lets runs land on two CPU generations.
CPU_PLATFORM="${GCP_CPU_PLATFORM:-Intel Granite Rapids}"

KEYS="core,core-wasm,core-native,honeydiff,ssim,hitchhikers-ssim,png,png-wasm,ssim-dssim"
PROVISIONING="SPOT"
FORWARDED=()

while [ $# -gt 0 ]; do
	case "$1" in
	--keys) KEYS="$2"; shift 2 ;;
	--keys=*) KEYS="${1#--keys=}"; shift ;;
	--on-demand) PROVISIONING="STANDARD"; shift ;;
	--) shift; FORWARDED=("$@"); break ;;
	*) echo "Unknown argument: $1" >&2; exit 2 ;;
	esac
done

if [ -z "$PROJECT" ]; then
	echo "Set GCP_PROJECT or run: gcloud config set project <id>" >&2
	exit 2
fi

cd "$REPO_ROOT"
SHA="$(git rev-parse HEAD)"
git fetch --quiet origin
if [ -z "$(git branch -r --contains "$SHA")" ]; then
	echo "HEAD $SHA is not on any remote branch. Push it first." >&2
	exit 1
fi
REPO_URL="$(git remote get-url origin | sed -E 's#^git@([^:]+):#https://\1/#')"

INSTANCE="blazediff-bench-${SHA:0:8}"
GCLOUD=(gcloud --project="$PROJECT")
SSH=("${GCLOUD[@]}" compute ssh "$INSTANCE" --zone="$ZONE" --ssh-flag=-oServerAliveInterval=30)

# shellcheck disable=SC2329 # invoked by trap
cleanup() {
	echo "==> Deleting $INSTANCE"
	"${GCLOUD[@]}" compute instances delete "$INSTANCE" --zone="$ZONE" --quiet || true
}

echo "==> Creating $INSTANCE ($MACHINE_TYPE, $PROVISIONING, $ZONE) for $SHA"
trap cleanup EXIT
# --max-run-duration deletes the VM even if this machine dies mid-run.
"${GCLOUD[@]}" compute instances create "$INSTANCE" \
	--zone="$ZONE" \
	--machine-type="$MACHINE_TYPE" \
	--threads-per-core=1 \
	--min-cpu-platform="$CPU_PLATFORM" \
	--provisioning-model="$PROVISIONING" \
	--max-run-duration=4h \
	--instance-termination-action=DELETE \
	--image-family=ubuntu-2404-lts-amd64 \
	--image-project=ubuntu-os-cloud \
	--boot-disk-type=hyperdisk-balanced \
	--boot-disk-size=50GB

echo "==> Waiting for SSH"
for attempt in $(seq 1 30); do
	"${SSH[@]}" --command=true --quiet >/dev/null 2>&1 && break
	if [ "$attempt" -eq 30 ]; then
		echo "SSH did not come up" >&2
		exit 1
	fi
	sleep 10
done

"${GCLOUD[@]}" compute scp "$SCRIPT_DIR/gcp-remote.sh" "$INSTANCE:gcp-remote.sh" --zone="$ZONE" --quiet

REMOTE_CMD="bash gcp-remote.sh $(printf '%q ' "$REPO_URL" "$SHA" "$KEYS" ${FORWARDED[@]+"${FORWARDED[@]}"})"
status=0
"${SSH[@]}" --command="$REMOTE_CMD" || status=$?

TMP="$(mktemp -d)"
if "${GCLOUD[@]}" compute scp "$INSTANCE:benchmarks.tgz" "$TMP/" --zone="$ZONE" --quiet; then
	tar xzf "$TMP/benchmarks.tgz" -C "$REPO_ROOT"
	echo "==> Results copied into benchmarks/. Review with: git diff benchmarks/"
else
	echo "No results to copy back" >&2
fi
rm -rf "$TMP"

exit "$status"
