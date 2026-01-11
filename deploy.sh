#!/bin/bash

# TrainTrack Deploy Script v2.2
echo "🚀 Preparing Update v2.2..."

# Commit message
MSG="Fixes v2.2: Center modals, fix labels, and add input constraints"

# Git deployment
git add .
git commit -m "$MSG"
git push

echo "✅ Deployment complete! App Version: v2.2"
echo "💡 Users may need to click 'Force Update' if cache persists."
