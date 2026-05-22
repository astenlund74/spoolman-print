#!/usr/bin/env bash
# Build and push the spoolman-print Docker image.
#
# Usage:
#   ./scripts/build-push.sh [VERSION]
#
# VERSION defaults to the current git tag (e.g. v1.0.0), falling back to the
# short commit SHA.  Pass "latest" to build/push only the :latest tag.
#
# Environment variables:
#   IMAGE     Full image name, default: stenlund/spoolman-print
#   PLATFORM  Build platform(s), default: linux/amd64
#             Use linux/amd64,linux/arm64 for multi-arch.
#
# Examples:
#   ./scripts/build-push.sh
#   ./scripts/build-push.sh v1.2.0
#   IMAGE=ghcr.io/astenlund74/spoolman-print ./scripts/build-push.sh v1.2.0

set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/astenlund74/spoolman-print}"
PLATFORM="${PLATFORM:-linux/amd64}"
VERSION="${1:-$(git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)}"

echo "▶ Building $IMAGE:$VERSION for $PLATFORM"

docker buildx build \
  --platform "$PLATFORM" \
  --tag "$IMAGE:$VERSION" \
  --tag "$IMAGE:latest" \
  --push \
  .

echo "✓ Pushed $IMAGE:$VERSION and $IMAGE:latest"

# Optionally tag and push to git if a clean semver was given as argument
if [[ "${1:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  if git tag "$1" 2>/dev/null; then
    echo "▶ Git tag $1 created — push with: git push origin $1"
  else
    echo "  Git tag $1 already exists, skipping"
  fi
fi
