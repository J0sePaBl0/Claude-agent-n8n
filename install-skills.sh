#!/bin/bash
# Installs n8n skills into Claude Code's global skills directory
dest="$HOME/.claude/skills"
mkdir -p "$dest"
cp -r "$(dirname "$0")/skills/"* "$dest/"
echo "n8n skills installed to $dest — restart Claude Code to activate."
