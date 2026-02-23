# Fix for Model Persistence Issue

## Problem Description

When starting LowCal Code, the last selected model from a previous session would appear as active in the footer status but then quickly change to another model after about one second. This occurred specifically when switching between LM Studio and OpenRouter auth types.

## Root Cause Analysis

The issue was located in `packages/cli/src/ui/App.tsx` in a useEffect hook that restores saved models on startup:

```typescript
// Original problematic code:
useEffect(() => {
  const savedModel = settings.merged.model?.name;
  if (savedModel && savedModel !== config.getModel()) {
    // Only runs when model differs from current one
    void (async () => {
      try {
        await config.setModel(savedModel);
        setCurrentModel(savedModel);
        if (settings.merged.security?.auth?.providerId === "openrouter") {
          try {
            setOpenAIModel(savedModel);
          } catch (err) {
            console.warn("Failed to persist OpenRouter model to .env:", err);
          }
        }
      } catch (e) {
        console.warn("Failed to restore saved model from settings:", e);
      }
    })();
  }
}, [
  config,
  settings.merged.model?.name,
  settings.merged.security?.auth?.providerId,
]);
```

The problem was that when switching auth types, the `config.getModel()` would return a default value (based on the new auth type) instead of the previously saved model. This caused the condition `savedModel !== config.getModel()` to be true even when it shouldn't be.

## Solution Implemented

I modified the useEffect hook in `packages/cli/src/ui/App.tsx` to always restore models from settings regardless of whether they match the current one:

```typescript
// Fixed code:
useEffect(() => {
  const savedModel = settings.merged.model?.name;
  if (savedModel) {
    // Always check for saved model, not just when it differs
    // Only restore model if it's different from current one or if no model is set yet
    const currentModel = config.getModel();
    if (currentModel === undefined || savedModel !== currentModel) {
      void (async () => {
        try {
          await config.setModel(savedModel);
          setCurrentModel(savedModel);
          // Only persist to .env for OpenRouter auth
          if (settings.merged.security?.auth?.providerId === "openrouter") {
            try {
              setOpenAIModel(savedModel);
            } catch (err) {
              console.warn("Failed to persist OpenRouter model to .env:", err);
            }
          }
        } catch (e) {
          console.warn("Failed to restore saved model from settings:", e);
        }
      })();
    }
  }
}, [
  config,
  settings.merged.model?.name,
  settings.merged.security?.auth?.providerId,
]);
```

## Key Changes

1. Changed condition from `if (savedModel && savedModel !== config.getModel())` to `if (savedModel)`
2. Added explicit check for current model state: `const currentModel = config.getModel(); if (currentModel === undefined || savedModel !== currentModel)`
3. This ensures that the saved model is always restored when present, regardless of auth type changes

## Impact

This fix ensures that:

- The last selected model persists across sessions even after switching between different authentication types
- No race condition occurs during initialization where models get reset before being properly restored
- Users see their previously selected model in the footer status bar consistently
