#!/usr/bin/env bash
#
# Fails when a commit or a pull request description credits an assistant, agent,
# tool, bot or service rather than a person — ground rule 5 in CONTRIBUTING.md.
#
#   scripts/check-credit.sh commits [<rev-range>]   # default: everything reachable
#   scripts/check-credit.sh text <file>             # e.g. a saved pull request body
#
# A script rather than a block of workflow YAML so it can be run on a branch
# before pushing, and pointed at a file, without a CI round trip.
#
# It matches whole words and known trailer forms on purpose. A commit that
# mentions an AI provider in prose is a commit about that provider; a `-By:`
# trailer or a "generated with" line is a claim about who wrote the change, and
# that is the thing being checked.

set -euo pipefail

# The names this needs to know about: agent applications, the vendors behind
# them, and the generic words that give a machine away.
AGENT='codebuff|claude|anthropic|openai|chatgpt|copilot|cursor|windsurf|devin|aider|codex|gemini|cline|qodo|tabnine|sourcegraph|cody|replit|gpt[[:space:]]*[0-9]|ai|a\.i\.|llm|agent|assistant|bot'

# Any `-By:` trailer — Co-Authored-By, Assisted-By, Generated-By, whatever is
# invented next — whose value names one of those.
TRAILER="^[A-Za-z][A-Za-z-]*-By:[[:space:]]*.*(^|[^[:alnum:]])(${AGENT})([^[:alnum:]]|$)"

# The prose forms the same claim gets written in, including the emoji that
# usually comes with them.
PROSE='🤖|(generated|written|created|authored|produced|assisted|co-authored)[[:space:]]+(with|by|using)[[:space:]]|(^|[^[:alnum:]])ai-generated'

PATTERNS=(-e "$TRAILER" -e "$PROSE")

report() {
  cat >&2 <<'MESSAGE'

Credit for an agent, tool, bot or service is not allowed in a commit message or a
pull request description (CONTRIBUTING.md, ground rule 5). Name the person
accountable for the change instead. If credit is wanted for something else, the
maintainer adds it deliberately.
MESSAGE
}

scan_commits() {
  local range="${1:-HEAD}"
  local found=0

  while IFS= read -r commit; do
    local body hits
    body=$(git log -1 --format=%B "$commit")
    hits=$(printf '%s\n' "$body" | grep -n -E -i "${PATTERNS[@]}" || true)
    if [ -n "$hits" ]; then
      printf '✗ %s %s\n' "${commit:0:12}" "$(git log -1 --format=%s "$commit")"
      printf '%s\n' "$hits" | sed 's/^/    line /'
      found=1
    fi
  done < <(git log --format=%H "$range")

  if [ "$found" -eq 1 ]; then
    report
    return 1
  fi
  echo "No agent credit in the commit messages of ${range}."
}

scan_text() {
  local file="$1" hits
  hits=$(grep -n -E -i "${PATTERNS[@]}" "$file" || true)
  if [ -n "$hits" ]; then
    printf '✗ %s\n' "$file"
    printf '%s\n' "$hits" | sed 's/^/    line /'
    report
    return 1
  fi
  echo "No agent credit in ${file}."
}

case "${1:-}" in
  commits)
    scan_commits "${2:-HEAD}"
    ;;
  text)
    [ -n "${2:-}" ] || { echo "usage: $0 text <file>" >&2; exit 2; }
    [ -f "$2" ] || { echo "$0: no such file: $2" >&2; exit 2; }
    scan_text "$2"
    ;;
  *)
    echo "usage: $0 commits [<rev-range>] | $0 text <file>" >&2
    exit 2
    ;;
esac
