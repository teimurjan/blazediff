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

"${GCLOUD[@]}" compute scp "${GCP_REMOTE_SCRIPT:-$SCRIPT_DIR/gcp-remote.sh}" "$INSTANCE:gcp-remote.sh" --zone="$ZONE" --quiet

REMOTE_ARGS="$(printf '%q ' "$REPO_URL" "$SHA" "$KEYS" ${FORWARDED[@]+"${FORWARDED[@]}"})"
# Detached from the SSH session, so a dropped connection does not kill the run.
"${SSH[@]}" --quiet --command="rm -f run.exit; setsid nohup bash -c 'bash gcp-remote.sh \"\$@\" > run.log 2>&1; echo \$? > run.exit' _ $REMOTE_ARGS < /dev/null > /dev/null 2>&1 &"

echo "==> Running on $INSTANCE, polling every 60s"
POLL_CMD='if [ -f run.exit ]; then echo "EXIT $(cat run.exit)"; fi; grep "^==>" run.log | tail -n 1'
status=""
last_step=""
while [ -z "$status" ]; do
	sleep 60
	if ! poll="$("${SSH[@]}" --quiet --command="$POLL_CMD" 2>/dev/null)"; then
		# A lookup that fails (e.g. this machine is offline) says nothing about the VM.
		if vm_status="$("${GCLOUD[@]}" compute instances describe "$INSTANCE" --zone="$ZONE" --format='value(status)' 2>&1)"; then
			if [ "$vm_status" != "RUNNING" ]; then
				echo "VM is $vm_status, giving up" >&2
				status=1
			fi
		elif grep -q "was not found" <<<"$vm_status"; then
			echo "VM is gone, giving up" >&2
			status=1
		fi
		continue
	fi
	step="$(grep -v '^EXIT ' <<<"$poll" || true)"
	if [ -n "$step" ] && [ "$step" != "$last_step" ]; then
		echo "$step"
		last_step="$step"
	fi
	status="$(sed -n 's/^EXIT //p' <<<"$poll")"
done

TMP="$(mktemp -d)"
if [ "$status" != 0 ] && "${GCLOUD[@]}" compute scp "$INSTANCE:run.log" "$TMP/" --zone="$ZONE" --quiet; then
	tail -n 40 "$TMP/run.log" >&2
fi
if "${GCLOUD[@]}" compute scp "$INSTANCE:benchmarks.tgz" "$TMP/" --zone="$ZONE" --quiet; then
	tar xzf "$TMP/benchmarks.tgz" -C "$REPO_ROOT"
	echo "==> Results copied into benchmarks/. Review with: git diff benchmarks/"
else
	echo "No results to copy back" >&2
fi
rm -rf "$TMP"

exit "$status"
