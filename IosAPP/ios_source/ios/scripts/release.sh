#!/usr/bin/env bash
set -e
cd $(dirname "$0")/../

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "master" ]; then
echo "Error: not on master. Exiting."
exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
    echo "Source directory must be clean, but changes exist. Commit any changes before release.";
    exit 1
fi

npm version patch -m 'prod-v%s'
git tag $(git show -s --format=%s)
git push
git push --tags

echo "Done"
