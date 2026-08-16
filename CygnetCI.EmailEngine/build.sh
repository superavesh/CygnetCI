#!/usr/bin/env bash
# Publish the EmailEngine as a self-contained Linux daemon (no .NET install needed).
set -euo pipefail
RUNTIME="${1:-linux-x64}"
OUT="${2:-./publish/$RUNTIME}"

echo "Publishing CygnetCI.EmailEngine ($RUNTIME)..."
dotnet publish ./CygnetCI.EmailEngine.csproj \
    -c Release -r "$RUNTIME" --self-contained true \
    -p:PublishSingleFile=false -o "$OUT"

echo ""
echo "Done -> $OUT"
cat <<'EOF'

Install as a systemd service:
  sudo cp cygnetci-emailengine.service /etc/systemd/system/
  # edit /etc/systemd/system/cygnetci-emailengine.service -> set WorkingDirectory/ExecStart to the publish path
  sudo systemctl daemon-reload
  sudo systemctl enable --now cygnetci-emailengine

Before starting: edit appsettings.json in the publish folder with your DB
connection string and RabbitMQ credentials.
EOF
