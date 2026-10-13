#!/usr/bin/env bash
#
# The gate between a staged release and a published one. It checks that every
# installer is present under the product name, that each one has an updater
# signature, and that the manifest installed apps will fetch is complete, signed,
# names the version being released and points at files that are actually on the
# release. A miss here becomes an update that never arrives, or one that arrives
# and is rejected, on someone else's machine — which is the whole reason this
# release process exists.
#
#   REPO=owner/name TAG=v0.2.0 scripts/verify-release.sh
#
# It needs `gh` and Node, and a token that can see drafts. Node rather than jq:
# the release path builds the frontend with it, so the checks can be run by hand
# against a staged draft exactly as the workflow runs them — which is how they
# were tested.
#
# Exits non-zero if anything is missing or wrong; the workflow publishes only
# when this exits zero.
set -euo pipefail

repo=${REPO:?set REPO to owner/name}
tag=${TAG:?set TAG to the release tag}

command -v gh >/dev/null || {
  echo "FAIL: gh is required to read a release"
  exit 2
}
command -v node >/dev/null || {
  echo "FAIL: node is required to read the manifest"
  exit 2
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Read the manifest with Node and print what this script needs from it: the
# version, the platform keys, and each entry's url and signature.
read_manifest() {
  node --input-type=module -e '
    import fs from "node:fs";
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const platforms = manifest.platforms ?? {};
    console.log(`version\t${manifest.version ?? ""}`);
    for (const [key, entry] of Object.entries(platforms)) {
      console.log(`${key}\t${entry.url ?? ""}\t${entry.signature ?? ""}`);
    }
  ' "$1"
}

names=$(gh release view "$tag" --repo "$repo" --json assets --jq '.assets[].name')
echo "Assets on release $tag:"
printf '%s\n' "$names" | sort
echo

fail=0

# One asset per platform, named after the product: the suffix says which platform
# it serves, and the prefix is the identity it installs. Checking both means a
# build that still calls itself something else cannot be published as this one.
for expected in '_x64-setup\.exe$' '_x86-setup\.exe$' '\.msi$' '\.deb$' '\.AppImage$'; do
  if found=$(grep -E -- "^OpenOdds_.*${expected}" <<<"$names"); then
    echo "ok:   $found"
  else
    echo "FAIL: no asset matching OpenOdds_*${expected}"
    fail=1
  fi
done

if grep -qxF -- "latest.json" <<<"$names"; then
  echo "ok:   latest.json"
else
  echo "FAIL: latest.json is missing, so no installed app would see this release"
  fail=1
fi

# An installer without its signature cannot be installed by the updater, so the
# two counts have to agree.
installers=$(grep -cE '\.(msi|exe|deb|AppImage)$' <<<"$names" || true)
signatures=$(grep -c '\.sig$' <<<"$names" || true)
echo "installers=$installers signatures=$signatures"
if [ "$installers" -gt 0 ] && [ "$installers" -eq "$signatures" ]; then
  echo "ok:   every installer has an updater signature"
else
  echo "FAIL: installers and signatures do not match (updates would be rejected)"
  fail=1
fi

echo
echo "Updater manifest:"
gh release download "$tag" --repo "$repo" -p latest.json -D "$work" --clobber
cat "$work/latest.json"
echo

entries=$(read_manifest "$work/latest.json")
manifest_version=$(awk -F'\t' '$1 == "version" { print $2 }' <<<"$entries")

# The manifest is what an installed app compares its own version against, so a
# manifest left on the previous version means this release reaches nobody.
if [ "$manifest_version" = "${tag#v}" ]; then
  echo "ok:   the manifest advertises $manifest_version, the version being tagged"
else
  echo "FAIL: the manifest says '${manifest_version}' but the tag is ${tag} — no installed app would see it"
  fail=1
fi
echo

for key in windows-x86_64 windows-i686 linux-x86_64; do
  if awk -F'\t' -v k="$key" '$1 == k { found = 1 } END { exit !found }' <<<"$entries"; then
    echo "ok:   latest.json advertises $key"
  else
    echo "FAIL: latest.json is missing the $key entry"
    fail=1
  fi
done
echo

# What the manifest promises, entry by entry. An entry with no signature, or one
# naming a file that is not on the release, fails on the machine that takes the
# update — so it fails here instead. The bundler suffix in a key (windows-x86_64
# -nsis, -msi) is part of the key, not of this check.
while IFS=$'\t' read -r key url signature; do
  # The first line this loop sees is the manifest version, not a platform.
  if [ "$key" = "version" ]; then continue; fi

  if [ -n "$signature" ]; then
    echo "ok:   $key is signed"
  else
    echo "FAIL: $key has no signature, so that update would be rejected"
    fail=1
  fi

  # The URL either ends in the file name or points at the asset API, whose last
  # path segment is a number — only the first can be checked against the assets.
  target=$(basename "$url")
  case "$target" in
    '' | [0-9]*)
      echo "    ($key points at the asset API, so its file name is not in the URL)"
      ;;
    *)
      if grep -qxF -- "$target" <<<"$names"; then
        echo "ok:   $key -> $target is on the release"
      else
        echo "FAIL: $key points at $target, which is not on the release"
        fail=1
      fi
      ;;
  esac
done <<<"$entries"

echo
if [ "$fail" -eq 0 ]; then
  echo "All release checks passed."
else
  echo "Release verification failed."
  exit 1
fi
