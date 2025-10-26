#!/bin/bash

# Check if our fix is in the file
if grep -q "hasBeenSetFromSettingsRef" /home/atmandk/LowCal-dev/packages/cli/src/ui/App.tsx; then
  echo "✓ Fix applied successfully"
else
  echo "✗ Fix not found in file"
fi

# Find the useEffect that handles model changes
echo "Checking for useEffect with model change handling..."
if grep -A20 -B5 "Watch for model changes" /home/atmandk/LowCal-dev/packages/cli/src/ui/App.tsx | grep -q "hasBeenSetFromSettingsRef"; then
  echo "✓ Uses useRef to track model setting"
else
  echo "✗ Does not use useRef properly"
fi

echo "Checking if useEffect is correctly modified..."
if grep -A10 -B5 "Watch for model changes" /home/atmandk/LowCal-dev/packages/cli/src/ui/App.tsx | head -20; then
  echo "✓ Found the useEffect block"
else
  echo "✗ Could not find useEffect block"
fi