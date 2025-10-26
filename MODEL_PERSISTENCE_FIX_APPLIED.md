# Model Persistence Fix - Applied

## Problem Description
When starting LowCal Code, the last selected model from a previous session would appear as active in the footer status but then quickly change to another model after about one second.

## Root Cause
Race condition in model restoration logic. The flag hasBeenSetFromSettingsRef.current was set INSIDE an async function, creating a window where the model change watcher could override the restored model before the flag was set.

## Solution
Moved the flag setting to BEFORE the async operation starts (line 270 in App.tsx).

## Key Changes
1. Moved flag setting to before async operation
2. Removed duplicate flag setting from inside async function
3. Added explanatory comments

## Impact
- Last selected model persists across sessions without flickering
- No race condition during initialization
- Model stays consistent in footer status bar
- Model doesn't change unexpectedly after ~1 second

## Files Modified
- packages/cli/src/ui/App.tsx (lines 265-294)

## Build Status
- Build: Successful
- Tests: No new failures

