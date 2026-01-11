#!/bin/bash

# TrainTrack Deployment Script
# This script increments versions and pushes to GitHub.

# 1. Update versions
echo "🔄 Updating versions..."

# Get current major version (1) and minor version (12)
CURRENT_VERSION=$(grep -o "v1\.[0-9]\+" index.html | head -n 1)
MINOR_VERSION=$(echo $CURRENT_VERSION | cut -d'.' -f2)
NEW_MINOR=$((MINOR_VERSION + 1))
NEW_VERSION="v1.$NEW_MINOR"

# Get current cache version (22)
CURRENT_CACHE=$(grep -o "v[0-9]\+" sw.js | head -n 1 | sed 's/v//')
NEW_CACHE=$((CURRENT_CACHE + 1))

echo "Current: $CURRENT_VERSION (Cache: $CURRENT_CACHE)"
echo "Next:    $NEW_VERSION (Cache: $NEW_CACHE)"

# Replace in files
# index.html (App Version and Cache Buster)
sed -i '' "s/App Version: $CURRENT_VERSION/App Version: $NEW_VERSION/g" index.html
sed -i '' "s/?v=$CURRENT_CACHE/?v=$NEW_CACHE/g" index.html

# sw.js (Cache Name)
sed -i '' "s/v$CURRENT_CACHE/v$NEW_CACHE/g" sw.js

# app.js (Version in Header)
sed -i '' "s/$CURRENT_VERSION/$NEW_VERSION/g" app.js

# 2. Git operations
echo "🚀 Pushing to GitHub..."
git add .
git commit -m "Deploy $NEW_VERSION: Cache v$NEW_CACHE"
git push

echo "✅ Deployment complete! New version: $NEW_VERSION"
