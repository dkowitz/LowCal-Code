import React from "react";
import { Box, Text } from "ink";
import { RadioButtonSelect } from "./shared/RadioButtonSelect.js";
import type { AvailableModel } from "../models/availableModels.js";
import { useKeypress } from "../hooks/useKeypress.js";
import type { Key } from "../contexts/KeypressContext.js";

export interface ModelMappingDialogProps {
  unmatched: AvailableModel[]; // configured-only models
  restModels: AvailableModel[]; // candidate REST models
  onApply: (mappings: Record<string, string>) => void; // maps configuredId -> restId
  onCancel: () => void;
}

export const ModelMappingDialog: React.FC<ModelMappingDialogProps> = ({
  unmatched,
  restModels,
  onApply,
  onCancel,
}) => {
  // Simple UX: for each unmatched model, pick best REST candidate by index
  const [selections, setSelections] = React.useState<Record<string, string>>(
    () => ({}),
  );
  const [activeIndex, setActiveIndex] = React.useState(0);

  const handleSelectFor = (configuredKey: string, restId: string) => {
    setSelections((s) => ({ ...s, [configuredKey]: restId }));
    // Persist single mapping immediately so it sticks even if the user
    // accidentally triggers other UI actions. Only persist non-empty mappings.
    if (restId) {
      (async () => {
        try {
          const storage = await import("../models/modelMappingStorage.js");
          const existing = await storage.loadMappings();
          const merged = { ...existing, [configuredKey]: restId };
          await storage.saveMappings(merged);
          console.log(
            "[LMStudio] Auto-persisted mapping for",
            configuredKey,
            restId,
          );
        } catch (e) {
          console.log(
            "[LMStudio] Failed to auto-persist mapping for",
            configuredKey,
            e,
          );
        }
      })();
    }
  };

  // Move focus to next unmatched entry when a selection is made
  const handleSelectedAndAdvance = (configuredKey: string, restId: string) => {
    handleSelectFor(configuredKey, restId);
    setActiveIndex((i) => Math.min(i + 1, Math.max(0, unmatched.length - 1)));
  };

  // Handle global keypresses: Enter to apply, Esc to cancel, Tab to move next, Shift-Tab to move prev
  useKeypress(
    (key: Key) => {
      const { name } = key;
      if (name === "escape") {
        onCancel();
        return;
      }
      if (name === "tab") {
        setActiveIndex((i) => (i + 1) % Math.max(1, unmatched.length));
        return;
      }
      if (name === "shift+tab") {
        setActiveIndex(
          (i) => (i - 1 + unmatched.length) % Math.max(1, unmatched.length),
        );
        return;
      }
      if (name === "return") {
        // Build mappings for non-empty selections
        const mappings: Record<string, string> = {};
        for (const u of unmatched) {
          const key = (u as any).configuredName ?? u.label;
          const v = selections[key];
          if (v) mappings[key] = v;
        }
        // Persist mappings immediately from the dialog to make sure they stick
        (async () => {
          try {
            const storage = await import("../models/modelMappingStorage.js");
            const existing = await storage.loadMappings();
            const merged = { ...existing, ...mappings };
            await storage.saveMappings(merged);
            console.debug(
              "[LMStudio] ModelMappingDialog persisted mappings:",
              merged,
            );
          } catch (e) {
            console.debug(
              "[LMStudio] ModelMappingDialog failed to persist mappings:",
              e,
            );
          }
        })();

        onApply(mappings);
        return;
      }
    },
    { isActive: true },
  );

  React.useEffect(() => {
    // noop: keep selections in sync if needed
  }, [selections]);

  return (
    <Box flexDirection="column" borderStyle="round" padding={1} width="100%">
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Map configured models to provider models</Text>
        <Text>
          Some configured models didn't match any provider model. Choose the
          best match or leave blank to skip.
        </Text>
      </Box>

      {unmatched.map((u, idx) => (
        <Box key={u.label} flexDirection="column" marginBottom={1}>
          <Text>
            {u.label} (configured:{" "}
            {u.configuredContextLength?.toLocaleString() ?? "?"} ctx)
          </Text>
          <Box>
            <RadioButtonSelect
              items={[
                { label: "(skip)", value: "" },
                ...restModels.map((r) => ({ label: r.id, value: r.id })),
              ]}
              initialIndex={0}
              onSelect={(val) =>
                handleSelectedAndAdvance(
                  (u as any).configuredName ?? u.label,
                  val,
                )
              }
              isFocused={activeIndex === idx}
            />
          </Box>
        </Box>
      ))}

      <Box>
        <Text>
          Press Enter to save mappings, Esc to cancel. Use Tab to move between
          entries.
        </Text>
      </Box>
    </Box>
  );
};
