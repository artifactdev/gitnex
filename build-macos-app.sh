#!/usr/bin/env bash
# Builds GitVolt.app locally, ad-hoc signs it, sets its minimum macOS version to 12.0, and copies
# it to target/<profile>/bundle/macos/GitVolt.app. The build runs in a fresh temporary target
# directory (compiling into a network volume can corrupt build artifacts); MACOSX_DEPLOYMENT_TARGET
# stays unset because this toolchain makes corrupt proc-macro dylibs with it.
#
# Needs Xcode's command line tools, CMake, Ninja, Node and the pinned Tauri CLI
# (`cargo install tauri-cli --version =3.0.0-alpha.5 --locked`). See docs/dev-setup.md.
set -euo pipefail
root=$(cd "$(dirname "$0")" && pwd)
fail() { echo "build-macos-app: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage: ./build-macos-app.sh [--debug] [--keep] [--install]

  --debug    build the debug profile instead of release
  --keep     keep the temporary build directory (removed on success otherwise; kept on failure)
  --install  also replace the app in $GITVOLT_APP_DIR (default: /Applications/GitVolt.app)

The existing bundle is swapped by renames in the same folder, so a running GitVolt keeps
running the old build until it is quit and reopened.
EOF
}

debug=0
keep=0
install=0
for arg in "$@"; do
  case "$arg" in
    --debug) debug=1 ;;
    --keep) keep=1 ;;
    --install) install=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option $arg (try --help)" ;;
  esac
done

[ "$(uname -s)" = Darwin ] || fail "builds on macOS only"
command -v cargo >/dev/null 2>&1 || fail "cargo not found"
cargo tauri --version >/dev/null 2>&1 || fail "the Tauri CLI is missing: cargo install tauri-cli --version =3.0.0-alpha.5 --locked"

profile=release
tauri_args=(--bundles app)
if [ "$debug" = 1 ]; then
  profile=debug
  tauri_args=(--debug --bundles app)
fi
build_dir=$(mktemp -d "${TMPDIR:-/tmp}/gitvolt-app.XXXXXX")
install_new=
cleanup() {
  local status=$?
  [ -n "$install_new" ] && rm -rf "$install_new"
  if [ "$keep" = 1 ] || [ "$status" -ne 0 ]; then
    echo "build-macos-app: build directory kept: $build_dir" >&2
  else
    rm -rf "$build_dir"
  fi
}
trap cleanup EXIT

echo "build-macos-app: building the $profile bundle (build directory: $build_dir)"
(cd "$root/crates/gitvolt-app" && \
  env -u CARGO_INCREMENTAL -u MACOSX_DEPLOYMENT_TARGET \
    CARGO_TARGET_DIR="$build_dir" CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-4}" \
    cargo tauri build "${tauri_args[@]}" \
      --config '{"bundle":{"macOS":{"minimumSystemVersion":null}}}')

built=$build_dir/$profile/bundle/macos/GitVolt.app
[ -d "$built" ] || fail "the build made no $built"
plist=$built/Contents/Info.plist
if ! /usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion 12.0" "$plist" 2>/dev/null; then
  /usr/libexec/PlistBuddy -c "Add :LSMinimumSystemVersion string 12.0" "$plist"
fi
codesign --force --deep --sign - --timestamp=none "$built" >/dev/null 2>&1
codesign --verify --deep --strict "$built"

dest=$root/target/$profile/bundle/macos/GitVolt.app
mkdir -p "$(dirname "$dest")"
rm -rf "$dest"
cp -R "$built" "$dest"
codesign --verify --deep --strict "$dest"
echo "build-macos-app: $dest"

if [ "$install" = 1 ]; then
  app_dir=${GITVOLT_APP_DIR:-/Applications}
  target=$app_dir/GitVolt.app
  [ -w "$app_dir" ] || fail "no write access to $app_dir (install by hand, or grant it and retry)"
  install_new=$app_dir/.GitVolt.app.new.$$
  install_old=$app_dir/.GitVolt.app.old.$$
  rm -rf "$install_new" "$install_old"
  ditto "$dest" "$install_new"
  if [ -d "$target" ]; then
    mv "$target" "$install_old"
    if ! mv "$install_new" "$target"; then
      mv "$install_old" "$target"
      fail "couldn't put the new bundle in place; the old one is back"
    fi
    install_new=
    rm -rf "$install_old"
  else
    mv "$install_new" "$target"
    install_new=
  fi
  codesign --verify --deep --strict "$target"
  echo "build-macos-app: installed $target"
  if pgrep -x GitVolt >/dev/null 2>&1; then
    echo "build-macos-app: GitVolt is running; quit and reopen it to use this build" >&2
  fi
fi
