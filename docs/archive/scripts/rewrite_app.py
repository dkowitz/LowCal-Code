import sys
from pathlib import Path

def rewrite_app():
    path = Path('packages/cli/src/ui/App.tsx')
    if not path.exists():
        print(f"Error: {path} not found")
        sys.exit(1)
    
    text = path.read_text()
    
    # 1. Clean up imports
    text = text.replace('import { ModelMappingDialog } from "./components/ModelMappingDialog.js";\n', '')
    text = text.replace('  getLMStudioConfiguredModels,\n', '')
    
    # 2. Remove mapping state and handlers
    # We'll use a more robust approach: find the block and remove it.
    import re
    
    # Remove the provider-specific context length resolution block (lines 357-400 approx)
    # This block still uses getLMStudioConfiguredModels and modelMappingStorage
    resolution_pattern = re.compile(r'if \(providerId === "lmstudio"\) \{.*?return;\n        \}', re.DOTALL)
    text = resolution_pattern.sub('', text)
    
    # Remove mapping state block
    state_pattern = re.compile(r'\s+// Model mapping dialog state.*?return <ModelMappingDialog \{...mappingProps\} />;\n  \};', re.DOTALL)
    text = state_pattern.sub('', text)
    
    # Remove applyModelMappings handler
    handler_pattern = re.compile(r'\s+// Handler to apply mappings from ModelMappingDialog.*?\[allAvailableModels\],?\n  \);', re.DOTALL)
    text = handler_pattern.sub('', text)
    
    # 3. Simplify handleModelSelectionOpen
    # This is the most critical part. We want to replace the entire fetch logic.
    fetch_pattern = re.compile(r'const handleModelSelectionOpen = useCallback\(.*?\}\n    \}\)\(\);\n  \}, \[.*?\]\);', re.DOTALL)
    
    new_fetch = """const handleModelSelectionOpen = useCallback(() => {
    (async () => {
      if (allAvailableModels.length > 0) {
        setAvailableModelsForDialog(allAvailableModels);
        setIsModelSelectionDialogOpen(true);
        return;
      }

      if (isFetchingModels) {
        return;
      }

      setIsFetchingModels(true);

      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (!contentGeneratorConfig) {
        setAvailableModelsForDialog([]);
        setIsModelSelectionDialogOpen(true);
        setIsFetchingModels(false);
        return;
      }

      let models: AvailableModel[] = [];
      try {
        if (contentGeneratorConfig.authType === AuthType.USE_OPENAI) {
          const baseUrl =
            contentGeneratorConfig.baseUrl ||
            process.env["OPENAI_BASE_URL"] ||
            "";
          const apiKey =
            contentGeneratorConfig.apiKey || process.env["OPENAI_API_KEY"];
          if (baseUrl) {
            models = await fetchOpenAICompatibleModels(baseUrl, apiKey);
          }
          const openAIModel = getOpenAIAvailableModelFromEnv();
          if (openAIModel && !models.find((m) => m.id === openAIModel.id)) {
            models.push(openAIModel);
          }
        } else {
          models = getFilteredQwenModels(
            settings.merged.experimental?.visionModelPreview ?? true,
          );
        }

        // Deduplicate models by id
        const seenIds = new Set<string>();
        models = models.filter((m) => {
          if (!m || !m.id) return false;
          if (seenIds.has(m.id)) return false;
          seenIds.add(m.id);
          return true;
        });

        setAllAvailableModels(models);
        setAvailableModelsForDialog(models);
        setIsModelSelectionDialogOpen(true);
      } finally {
        setIsFetchingModels(false);
      }
    })();
  }, [
    allAvailableModels,
    config,
    settings.merged.experimental?.visionModelPreview,
    isFetchingModels,
  ]);"""
    
    text = fetch_pattern.sub(new_fetch, text)
    
    # 4. Clean up handleModelSelect
    # Remove modelMappingStorage and matchedRestId logic
    select_pattern = re.compile(r'const handleModelSelect = useCallback\(.*?refreshLmStudioModel,\n    \],\n  \);', re.DOTALL)
    
    new_select = """const handleModelSelect = useCallback(
    async (modelId: string) => {
      try {
        const selectedModel = allAvailableModels.find(
          (model) => model.id === modelId
        );
        const configuredContextLength =
          selectedModel?.maxContextLength ??
          selectedModel?.contextLength;

        config.setModelContextLimit(modelId, configuredContextLength);

        const contentGeneratorConfig = config.getContentGeneratorConfig();
        const baseUrl = contentGeneratorConfig?.baseUrl || "";
        const providerId = settings.merged.security?.auth?.providerId;
        const isLmStudioProvider =
          providerId === "lmstudio" ||
          baseUrl.includes("127.0.0.1:1234") ||
          baseUrl.includes("localhost:1234");

        // Unload previous model by setting new model (config.setModel will reinitialize client)
        await config.setModel(modelId);
        setCurrentModel(modelId);
        
        if (settings.merged.security?.auth?.providerId === "openrouter") {
          try {
            setOpenAIModel(modelId);
          } catch (err) {
            console.warn("Failed to persist OpenRouter model to .env:", err);
          }

          // Attempt to fetch REST models immediately to pick up provider-reported context_length
          try {
            const contentGeneratorConfig = config.getContentGeneratorConfig();
            const baseUrl =
              contentGeneratorConfig?.baseUrl ||
              process.env["OPENAI_BASE_URL"] ||
              "";
            const apiKey =
              contentGeneratorConfig?.apiKey || process.env["OPENAI_API_KEY"];
            if (baseUrl) {
              const restModels = await (
                await import("./models/availableModels.js")
              ).fetchOpenAICompatibleModels(baseUrl, apiKey);
              const matched = restModels.find(
                (r) => r.id === modelId || r.label === modelId
              );
              const ctx =
                matched?.contextLength ??
                matched?.maxContextLength ??
                undefined;
              config.setModelContextLimit(modelId, ctx);

              // notify UI to re-read model-level limits (forces re-render)
              try {
                setModelLimitVersion((v) => v + 1);
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            if (config.getDebugMode())
              console.debug(
                "Failed to fetch OpenRouter models for immediate context length update:",
                e,
              );
          }
        }
        
        // Persist selected model to user settings
        try {
          settings.setValue(SettingScope.User, "model.name", modelId);
        } catch (e) {
          console.warn("Failed to persist selected model to settings:", e);
        }
        
        setIsModelSelectionDialogOpen(false);
        addItem(
          {
            type: MessageType.INFO,
            text: `Switched model to \`${modelId}\` for this session.`,
          },
          Date.now(),
        );
        
        // Send a small warm-up query to prime remote models (non-blocking)
        if (!isLmStudioProvider) {
          try {
            const gemini = config.getGeminiClient();
            if (gemini) {
              void gemini
                .generateContent(
                  [{ role: "user", parts: [{ text: "Say hello." }] }],
                  {},
                  new AbortController().signal,
                  modelId,
                )
                .catch(() => {});
            }
          } catch (e) {
            // ignore warm-up errors
          }
        }

        if (isLmStudioProvider) {
          await refreshLmStudioModel(true);
        }
      } catch (error) {
        console.error("Failed to switch model:", error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to switch to model \`${modelId}\`. Please try again.`,
          },
          Date.now(),
        );
      }
    },
    [
      allAvailableModels,
      config,
      setCurrentModel,
      addItem,
      settings.merged.security?.auth?.providerId,
      refreshLmStudioModel,
    ],
  );"""
    
    text = select_pattern.sub(new_select, text)
    
    # 5. Remove renderModelMappingDialog call and focus logic
    text = text.replace('\n        {renderModelMappingDialog()}', '')
    text = text.replace('focus={isFocused && !isModelMappingDialogOpen}', 'focus={isFocused}')
    
    path.write_text(text)
    print("Successfully rewrote App.tsx")

if __name__ == "__main__":
    rewrite_app()
