/**
 * Utility for persisting mappings between configured LM Studio filenames and
 * REST model ids. Stored under ~/.qwen/lmstudio-model-mappings.json
 */
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const MAPPINGS_PATH = path.join(os.homedir(), '.qwen', 'lmstudio-model-mappings.json');

export type Mappings = Record<string, string>;

export async function loadMappings(): Promise<Mappings> {
  try {
    const raw = await fs.readFile(MAPPINGS_PATH, 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      console.log('[LMStudio] Loaded model mappings from', MAPPINGS_PATH, obj);
      return obj as Mappings;
    }
  } catch (e) {
    // ignore
  }
  return {};
}

export async function saveMappings(mappings: Mappings): Promise<void> {
  try {
    await fs.mkdir(path.dirname(MAPPINGS_PATH), { recursive: true });
    await fs.writeFile(MAPPINGS_PATH, JSON.stringify(mappings, null, 2), 'utf8');
    console.debug('[LMStudio] Saved model mappings to', MAPPINGS_PATH, mappings);
  } catch (e) {
    console.debug('[LMStudio] Failed to save model mappings to', MAPPINGS_PATH, e);
    // ignore write failures for now
  }
}
