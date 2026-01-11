#!/bin/bash

# TrainTrack Deploy Script v2.1
echo "🚀 Preparing Update v2.1..."

# Commit message
MSG="Refinements v2.1: Hide FAB in settings and simplify category labels"

# Git deployment
git add .
git commit -m "$MSG"
git push

echo "✅ Deployment complete! App Version: v2.1"
echo "💡 Users may need to click 'Force Update' if cache persists."
