#!/usr/bin/env bash
# Usage: bash init_config.sh <model>
# Example: bash init_config.sh gemma3:4b

set -euo pipefail

MODEL="${1:-qwen3:14b}"
SERVICE_PATH="/etc/systemd/system/ollama.service"

# Extension/browser origins allowed to call the local API (adjust as needed)
# Include extension schemes and localhost patterns used during development.
OLLAMA_ORIGINS='chrome-extension://*,moz-extension://*,safari-we  b-extension://*,http://localhost,http://localhost:*,https://localhost,https://localhost:*,http://127.0.0.1,http://127.0.0.1:*,https://127.0.0.1,https://127.0.0.1:*'

# Helper: wait for Ollama HTTP API to be ready
wait_for_ollama() {
  echo "Waiting for Ollama API to be ready on 127.0.0.1:11434 ..."
  for i in {1..60}; do
    if curl -sf http://127.0.0.1:11434/api/version >/dev/null; then
      echo "Ollama API is ready."
      return 0
    fi
    sleep 1
  done
  echo "ERROR: Ollama API did not become ready in time." >&2
  exit 1
}

echo "Checking for Ollama ..."
if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama not found, installing ..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "Ollama already installed."
fi

# Resolve the installed ollama binary path for systemd ExecStart
OLLAMA_BIN="$(command -v ollama)"

echo "Configuring systemd service ..."
sudo bash -c "cat > '${SERVICE_PATH}'" <<EOF
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
ExecStart=${OLLAMA_BIN} serve
Restart=always
RestartSec=3
# Run as the current user to store models under their home
User=$(whoami)
Group=$(id -gn)
Environment=OLLAMA_ORIGINS=${OLLAMA_ORIGINS}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
EOF

echo "Starting service and enabling on boot ..."
sudo systemctl daemon-reload
sudo systemctl enable --now ollama

# Wait for API readiness before CLI commands that require the server
wait_for_ollama

echo "Pulling model: ${MODEL} ..."
ollama pull "${MODEL}"

echo "Installed models:"
ollama list

echo
echo "Done. Ollama runs as a background systemd service and will start on reboot."
echo "Update the browser extension to use model: ${MODEL} and API http://127.0.0.1:11434."
