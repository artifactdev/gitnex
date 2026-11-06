#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail() { echo "test-build-macos-app: FAIL: $*" >&2; exit 1; }

mkdir "$tmp/bin"
ln -s "$(command -v dirname)" "$tmp/bin/dirname"
ln -s "$(command -v env)" "$tmp/bin/env"
ln -s "$(command -v grep)" "$tmp/bin/grep"
cat > "$tmp/bin/uname" <<'EOF'
#!/bin/bash
echo Darwin
EOF
cat > "$tmp/bin/cargo" <<'EOF'
#!/bin/bash
exit 0
EOF
cat > "$tmp/bin/mktemp" <<'EOF'
#!/bin/bash
echo "reached build setup" >&2
exit 1
EOF
chmod +x "$tmp/bin/uname" "$tmp/bin/cargo" "$tmp/bin/mktemp"

run() {
  local output
  if output=$(PATH="$tmp/bin" CMAKE="${CMAKE_FOR_TEST:-}" /bin/bash "$root/build-macos-app.sh" "$@" 2>&1); then
    fail "unexpected success: $*"
  fi
  printf '%s\n' "$output"
}

output=$(run)
[[ "$output" == *"CMake not found"* && "$output" == *"brew install cmake ninja"* ]] || fail "missing CMake: $output"
ln -s /usr/bin/true "$tmp/bin/cmake"
output=$(run)
[[ "$output" == *"Ninja not found"* && "$output" == *"brew install ninja"* ]] || fail "missing Ninja: $output"
ln -s /usr/bin/true "$tmp/bin/ninja"
output=$(run)
[[ "$output" == *"reached build setup"* ]] || fail "available tools: $output"
rm "$tmp/bin/cmake" "$tmp/bin/ninja"
output=$(run --wkwebview)
[[ "$output" == *"reached build setup"* ]] || fail "WKWebView requires CEF tools: $output"
ln -s /usr/bin/true "$tmp/bin/ninja"
CMAKE_FOR_TEST=/usr/bin/true
output=$(run)
[[ "$output" == *"reached build setup"* ]] || fail "custom CMake: $output"
unset CMAKE_FOR_TEST
export CMAKE_aarch64_apple_darwin=/usr/bin/true
output=$(run)
[[ "$output" == *"reached build setup"* ]] || fail "target-specific CMake: $output"
echo "test-build-macos-app: OK"
