#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(python3 - <<'PY'
import json
with open('package.json', 'r', encoding='utf-8') as fh:
    print(json.load(fh)['version'])
PY
)"
OUT_DIR="$ROOT/dist"
mkdir -p "$OUT_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PACKAGE_DIR="$TMP_DIR/fynext-linux-$VERSION"
mkdir -p "$PACKAGE_DIR/runtime"

NODE_HOME="${NODE_HOME:-/home/mfiretech/.local/node}"
if [ ! -x "$NODE_HOME/bin/node" ]; then
  echo "Node.js binary not found at $NODE_HOME/bin/node. Please install Node 20+ first or set NODE_HOME." >&2
  exit 1
fi

cp -a "$NODE_HOME" "$PACKAGE_DIR/runtime/node"
mkdir -p "$PACKAGE_DIR/app"
# Copy the release content while excluding developer-only folders.
find "$ROOT" -mindepth 1 -maxdepth 1 \
  ! -name '.git' \
  ! -name '.archive' \
  ! -name 'dist' \
  ! -name 'node_modules' \
  -exec cp -a {} "$PACKAGE_DIR/app/" \;

cat > "$PACKAGE_DIR/fynext" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$ROOT/runtime/node/bin/node" "$ROOT/app/bin/fynext.js" "$@"
SH
chmod +x "$PACKAGE_DIR/fynext"

cat > "$PACKAGE_DIR/install.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-/opt/fynext}"
mkdir -p "$APP_DIR"
cp -a "$PACKAGE_DIR"/. "$APP_DIR/"
ln -sfn "$APP_DIR/fynext" /usr/local/bin/fynext
cat <<'EOF'
Fynext installed successfully.
Run it with:
  fynext
EOF
SH
chmod +x "$PACKAGE_DIR/install.sh"

TARBALL="$OUT_DIR/fynext-linux-$VERSION.tar.gz"
cd "$TMP_DIR"
tar -czf "$TARBALL" "fynext-linux-$VERSION"

echo "Created Linux package: $TARBALL"
