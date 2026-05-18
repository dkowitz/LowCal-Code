/**
 * @license
 * Copyright 2025 Darrin
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Information about a new llama.cpp release available for update. */
export interface LlamaCppUpdateInfo {
  /** The latest release tag (e.g., "b9159"). */
  latestTag: string;
  /** Current bundled tag (from the binary --version output). */
  currentTag: string;
  /** Release notes URL. */
  releaseUrl: string;
  /** Human-readable message describing the update. */
  message: string;
}

/** Cached check result stored on disk. */
interface UpdateCheckCache {
  /** The latest tag that was checked. */
  latestTag: string;
  /** Timestamp of when this check was performed (ms since epoch). */
  checkedAt: number;
  /** Platform/arch the cache is valid for. */
  platformKey: string;
}

const GITHUB_REPO = "ggml-org/llama.cpp";
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const DOWNLOAD_BASE = `https://github.com/${GITHUB_REPO}/releases/download`;

/** Cache lifetime: 24 hours in milliseconds. */
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 3000;

/**
 * Get the config directory for LowCal (same as .qwen).
 */
function getConfigDir(): string {
  const home = os.homedir();
  return path.join(home, ".qwen");
}

/**
 * Get the path to the update check cache file.
 */
function getCachePath(): string {
  return path.join(getConfigDir(), "llama-cpp-update-cache.json");
}

/**
 * Detect the current platform and architecture for binary selection.
 * Mirrors the logic in postinstall.js.
 */
function detectPlatform(): { osName: string; arch: string } | null {
  const platform = process.platform; // 'linux', 'darwin', 'win32'
  let arch: string;

  if (platform === "win32") {
    arch = os.arch() === "arm64" ? "arm64" : "x64";
  } else {
    arch = os.arch();
  }

  return { osName: platform, arch };
}

/**
 * Get the platform-specific asset name for a given release tag.
 */
function getAssetName(tag: string): string | null {
  const detected = detectPlatform();
  if (!detected) return null;

  const { osName, arch } = detected;

  const platforms: Record<string, Record<string, string | null>> = {
    linux: {
      arm64: null,
      x64: `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`,
    },
    darwin: {
      arm64: `llama-${tag}-bin-macos-arm64.tar.gz`,
      x64: `llama-${tag}-bin-macos-x64.tar.gz`,
    },
    win32: {
      x64: `llama-${tag}-bin-win-x64.zip`,
      arm64: null,
    },
  };

  return platforms[osName]?.[arch] ?? null;
}

/**
 * Get the current bundled llama.cpp tag from the installed marker file.
 * Written by postinstall.js alongside the binary.
 */
function getCurrentTag(): string | null {
  const candidates = [
    path.resolve(moduleDir, "..", "..", "core", "bin"),
    path.resolve(moduleDir, "..", "..", "..", "bin"),
    path.resolve(moduleDir, "..", "packages", "core", "bin"),
    path.resolve(moduleDir, "packages", "core", "bin"),
  ];

  const markerPath = path.join(candidates[0], ".llama-cpp-version");

  if (!fs.existsSync(markerPath)) return null;

  try {
    return fs.readFileSync(markerPath, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Fetch the latest release from GitHub with a timeout.
 * Returns null on timeout or error.
 */
async function fetchLatestRelease(): Promise<{ tag: string; url: string } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "LowCalCode",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag_name: string; html_url: string };
    return { tag: data.tag_name, url: data.html_url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Read the cached update check result.
 */
function readCache(): UpdateCheckCache | null {
  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) return null;

  try {
    const content = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as UpdateCheckCache;
  } catch {
    return null;
  }
}

/**
 * Write the update check result to disk cache.
 */
function writeCache(latestTag: string): void {
  const cacheDir = getConfigDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cache: UpdateCheckCache = {
    latestTag,
    checkedAt: Date.now(),
    platformKey: `${process.platform}-${os.arch()}`,
  };

  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2));
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Check if an update is available for llama.cpp.
 * Uses a 24-hour disk cache to avoid unnecessary API calls.
 *
 * @returns Update info if a newer version is available, null otherwise.
 */
export async function checkForLlamaCppUpdate(force = false): Promise<LlamaCppUpdateInfo | null> {
  const detected = detectPlatform();
  if (!detected) return null;

  // Check cache first
  const cache = force ? null : readCache();
  if (cache) {
    const age = Date.now() - cache.checkedAt;
    const isStale = age > CACHE_LIFETIME_MS || cache.platformKey !== `${detected.osName}-${detected.arch}`;

    if (!isStale) {
      // Cache is fresh — no update needed
      return null;
    }
  }

  // Fetch latest release from GitHub
  const latest = await fetchLatestRelease();
  if (!latest) return null;

  // Get the asset name for this platform — this also validates we have a supported platform
  const assetName = getAssetName(latest.tag);
  if (!assetName) return null;

  // Compare with current bundled tag
  const currentTag = getCurrentTag();

  // If we can't determine the current tag, skip the update check
  if (!currentTag) return null;

  // Check if there's actually a newer version by comparing tags
  // llama.cpp uses format like "b9159" — simple string comparison works for these hashes
  const needsUpdate = latest.tag !== currentTag;

  if (!needsUpdate) {
    // No update available — clear stale cache to avoid repeated checks
    if (cache) {
      try {
        fs.unlinkSync(getCachePath());
      } catch { /* ignore */ }
    }
    return null;
  }

  const asset = getAssetName(latest.tag);
  if (!asset) return null;

  // We have an update available — cache it so we don't nag every startup
  writeCache(latest.tag);

  return {
    latestTag: latest.tag,
    currentTag,
    releaseUrl: latest.url,
    message: `llama.cpp update available: ${latest.tag}`,
  };
}

/**
 * Download and install the latest llama.cpp binary.
 * Reuses the download/extract logic from postinstall.js.
 *
 * @returns true if installation succeeded, false otherwise.
 */
export async function installLlamaCppUpdate(): Promise<boolean> {
  const detected = detectPlatform();
  if (!detected) return false;

  const cache = readCache();
  if (!cache) return false;

  const assetName = getAssetName(cache.latestTag);
  if (!assetName) return false;

  const downloadUrl = `${DOWNLOAD_BASE}/${cache.latestTag}/${assetName}`;
  const binDir = path.resolve(__dirname, "..", "..", "core", "bin");

  // Ensure bin directory exists
  fs.mkdirSync(binDir, { recursive: true });

  console.log(`[llama.cpp] Downloading ${assetName}...`);

  try {
    const response = await globalThis.fetch(downloadUrl);
    if (!response || !response.body) {
      throw new Error("fetch returned no body");
    }

    const tarballPath = path.join(os.tmpdir(), assetName);
    const fileStream = fs.createWriteStream(tarballPath);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await import("node:stream/promises").then(({ pipeline }: any) =>
      pipeline(response.body as any, fileStream)
    );

    console.log(`[llama.cpp] Extracting to ${binDir}...`);

    const extractDir = path.join(os.tmpdir(), `llama-cpp-extract-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    if (assetName.endsWith(".zip")) {
      execSync(`unzip -o "${tarballPath}" -d "${extractDir}"`, { stdio: "inherit" });
    } else {
      execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, { stdio: "inherit" });
    }

    // Copy all extracted files into bin/ (Vulkan build ships with ~30 .so files)
    await copyRecursive(extractDir, binDir);

    // Clean up
    fs.unlinkSync(tarballPath);
    fs.rmSync(extractDir, { recursive: true, force: true });

    // Clear the cache since we've installed the update
    try {
      fs.unlinkSync(getCachePath());
    } catch { /* ignore */ }

    console.log(`[llama.cpp] Update installed successfully.`);
    return true;
  } catch (err) {
    console.error(`[llama.cpp] Update failed: ${err instanceof Error ? err.message : String(err)}`);

    // Fallback to curl/wget
    try {
      const tarballPath = path.join(os.tmpdir(), assetName);
      execSync(`curl -fSL -o "${tarballPath}" "${downloadUrl}"`, { stdio: "inherit" });

      const extractDir = path.join(os.tmpdir(), `llama-cpp-extract-${Date.now()}`);
      fs.mkdirSync(extractDir, { recursive: true });

      if (assetName.endsWith(".zip")) {
        execSync(`unzip -o "${tarballPath}" -d "${extractDir}"`, { stdio: "inherit" });
      } else {
        execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, { stdio: "inherit" });
      }

      await copyRecursive(extractDir, binDir);
      fs.unlinkSync(tarballPath);
      fs.rmSync(extractDir, { recursive: true, force: true });

      try {
        fs.unlinkSync(getCachePath());
      } catch { /* ignore */ }

      console.log(`[llama.cpp] Update installed successfully (via curl).`);
      return true;
    } catch (fallbackErr) {
      console.error(`[llama.cpp] Fallback install also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
      return false;
    }
  }
}

/**
 * Recursively copy a directory tree, preserving structure and permissions.
 */
async function copyRecursive(src: string, dest: string): Promise<void> {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      const stats = fs.statSync(srcPath);
      if (stats.mode & 0o111) {
        fs.chmodSync(destPath, 0o755);
      }
    }
  }
}
