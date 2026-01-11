#!/bin/bash

# TrainTrack Deploy Script v2.0 (Full Rebuild)
echo "🚀 Preparing Major Update v2.0..."

# Commit message
MSG="Full Codebase Rebuild v2.0: Major structural and design overhaul"

# Git deployment
git add .
git commit -m "$MSG"
git push

echo "✅ Deployment complete! App Version: v2.0 (Build 200)"
echo "💡 Users may need to click 'Force Update' if cache persists."
