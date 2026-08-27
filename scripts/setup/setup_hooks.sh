#!/usr/bin/env bash
# Install git pre-push hook for AI log submission (POSIX / Git Bash).
# Run once after cloning: bash scripts/setup/setup_hooks.sh
set -e

script_directory=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repository_root=$(CDPATH= cd -- "$script_directory/../.." && pwd)
git_hooks_directory="$repository_root/.git/hooks"
hook_file="$git_hooks_directory/pre-push"

if [[ ! -d "$git_hooks_directory" ]]; then
  echo "[ai-log] Git hooks directory was not found: $git_hooks_directory" >&2
  exit 1
fi

cat > "$hook_file" <<'EOF'
#!/usr/bin/env bash
# Pre-push: sweep recent Antigravity / Gemini prompts, then submit AI logs.
# Uses the cross-platform Python launcher so it works whether the user
# has python3, python, or only the `py` launcher (Windows).
# Git normally starts hooks at the worktree root, but resolve it explicitly so
# the script paths remain valid when the hook is invoked from another cwd.
repository_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repository_root" || exit 0
bash scripts/ai-logging/_pyrun.sh scripts/ai-logging/log_antigravity.py --auto || true
bash scripts/ai-logging/_pyrun.sh scripts/ai-logging/submit_log.py || true
exit 0  # Never block push, even if either step fails
EOF

chmod +x "$hook_file"
chmod +x "$repository_root/scripts/ai-logging/_pyrun.sh" 2>/dev/null || true
echo "[ai-log] Git pre-push hook installed."

mkdir -p "$repository_root/.ai-log"
touch "$repository_root/.ai-log/.gitkeep"

echo "[ai-log] Setup complete. Configure AI_LOG_SERVER in your .env file."
