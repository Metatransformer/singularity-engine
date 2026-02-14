#!/bin/bash
set -e

# Singularity Engine — One-liner installer
# curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash

REPO="https://github.com/Metatransformer/singularity-engine.git"
INSTALL_DIR="$HOME/singularity-engine"

echo "🦀 Installing Singularity Engine..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js is required (v20+). Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js v20+ required (found v$(node -v))"
  exit 1
fi

# Check if already in the repo
if [ -f "package.json" ] && grep -q '"singularity-engine"' package.json 2>/dev/null; then
  echo "📂 Already in singularity-engine repo"
  INSTALL_DIR="$(pwd)"
elif [ -d "$INSTALL_DIR" ]; then
  echo "📂 Found existing install at $INSTALL_DIR"
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || true
else
  echo "📥 Cloning repository..."
  git clone "$REPO" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install deps
echo "📦 Installing dependencies..."
npm install

# Make CLI executable
chmod +x bin/cli.mjs

# Create symlink
echo "🔗 Creating symlink..."
if [ -w /usr/local/bin ]; then
  ln -sf "$INSTALL_DIR/bin/cli.mjs" /usr/local/bin/singularityengine
else
  sudo ln -sf "$INSTALL_DIR/bin/cli.mjs" /usr/local/bin/singularityengine
fi

# Verify
if command -v singularityengine &> /dev/null; then
  echo ""
  echo "✅ Installed! Run 'singularityengine --help' to get started."
  echo ""
  echo "Quick start:"
  echo "  singularityengine config    # Set up API keys"
  echo "  singularityengine deploy    # Deploy to AWS"
  echo "  singularityengine status    # Check status"
else
  echo ""
  echo "✅ Installed at $INSTALL_DIR"
  echo "⚠️  /usr/local/bin not in PATH. Add it or run directly:"
  echo "  node $INSTALL_DIR/bin/cli.mjs --help"
fi
