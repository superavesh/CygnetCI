#!/usr/bin/env bash
# Build a self-contained Linux "embedded Python" bundle for the API — the Linux
# analog of the Windows embeddable dist/ (python + all deps + app in one folder).
#
# MUST be run on Linux (native, WSL, CI, or a Linux Docker build) — it produces
# Linux binaries. The resulting ./dist-linux runs with:
#     cd dist-linux && ./python/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
#
# Uses python-build-standalone (relocatable CPython). Pick the variant that matches
# your TARGET runtime:
#   - glibc (Debian/Ubuntu base or bare servers):  x86_64-unknown-linux-gnu
#   - musl  (Alpine base):                          x86_64-unknown-linux-musl
#   - arm64:                                        aarch64-unknown-linux-gnu
set -euo pipefail

# 1) Pick the latest release tag + a Python version from:
#    https://github.com/astral-sh/python-build-standalone/releases
#    Use the "install_only" asset (relocatable, includes pip).
PBS_TAG="${PBS_TAG:-20250115}"          # <-- set to a real release tag
PYVER="${PYVER:-3.12.8}"                # <-- matching Python version in that release
TARGET="${TARGET:-x86_64-unknown-linux-gnu}"

OUT="dist-linux"
ASSET="cpython-${PYVER}+${PBS_TAG}-${TARGET}-install_only.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ASSET}"

echo ">> Downloading ${ASSET}"
rm -rf "$OUT"; mkdir -p "$OUT"
curl -fL "$URL" | tar -xz -C "$OUT"     # extracts to $OUT/python

echo ">> Installing dependencies into the bundle"
"$OUT/python/bin/python" -m pip install --no-cache-dir --upgrade pip
"$OUT/python/bin/python" -m pip install --no-cache-dir -r requirements.txt

echo ">> Copying application code"
cp -v *.py "$OUT/" 2>/dev/null || true
cp -v config.ini.template "$OUT/config.ini" 2>/dev/null || true   # edit for the target

cat > "$OUT/start_api.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec ./python/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
EOF
chmod +x "$OUT/start_api.sh"

echo ">> Done. Bundle is in ./$OUT  (run ./$OUT/start_api.sh)"
