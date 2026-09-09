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

# Copy Python sub-packages (any top-level dir with __init__.py, e.g. routers/) so
# code that has been split into its own folder is still deployed, subfolders included.
for d in */; do
    d="${d%/}"
    [ "$d" = "$OUT" ] && continue
    if [ -f "$d/__init__.py" ]; then
        echo ">> Copying package: $d/"
        rm -rf "$OUT/$d"
        cp -rv "$d" "$OUT/"
        find "$OUT/$d" -name "__pycache__" -type d -prune -exec rm -rf {} +
    fi
done

# Bundle the SQL migration files from the sibling CygnetCI.Database project so the
# run_*_migration.py scripts can find them when run on the target server.
DB_SRC_DIR="../CygnetCI.Database"
if [ -d "$DB_SRC_DIR" ]; then
    echo ">> Copying CygnetCI.Database/*.sql -> $OUT/CygnetCI.Database"
    mkdir -p "$OUT/CygnetCI.Database"
    cp -v "$DB_SRC_DIR"/*.sql "$OUT/CygnetCI.Database/" 2>/dev/null || true
fi

cat > "$OUT/start_api.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
exec ./python/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
EOF
chmod +x "$OUT/start_api.sh"

# Self-contained Dockerfile so this bundle can be built as an image directly,
# with no separate context/dockerignore juggling: cd "$OUT" && docker build -t <tag> .
# Base image must match $TARGET's libc: musl target -> alpine, gnu target -> debian-slim.
case "$TARGET" in
    *musl*) BASE_IMAGE="alpine:3.20" ;;
    *)      BASE_IMAGE="debian:12-slim" ;;
esac

if [[ "$BASE_IMAGE" == alpine:* ]]; then
    APT_LINES='RUN apk add --no-cache ca-certificates curl'
else
    APT_LINES='RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \'$'\n''    && rm -rf /var/lib/apt/lists/*'
fi

cat > "$OUT/Dockerfile" <<EOF
# CygnetCI API - built from this pre-built Linux bundle (produced by
# build_linux_bundle.sh, target: ${TARGET}).
# Build (from inside this directory):  docker build -t cygnetci-api:latest .
FROM ${BASE_IMAGE}
${APT_LINES}
WORKDIR /app
COPY . .
# config.ini is provided at runtime via a mounted secret/volume at /app/config.ini.
EXPOSE 8000
CMD ["python/bin/python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF

cat > "$OUT/.dockerignore" <<'EOF'
__pycache__/
*.pyc
logs/
EOF

echo ">> Done. Bundle is in ./$OUT"
echo ">>   Run directly:   ./$OUT/start_api.sh"
echo ">>   Build image:    cd $OUT && docker build -t cygnetci-api:latest ."
