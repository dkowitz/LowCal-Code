/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* global console, process */

/**
 * postinstall script — downloads the prebuilt llama.cpp binary for the current platform.
 *
 * This ensures LowCal ships with a working llama-server out of the box,
 * so users don't need to build or install it manually.
 *
 * Backend selection:
 *   LLAMA_CPP_BACKEND=auto   → platform default (Linux Vulkan, Windows CPU)
 *   LLAMA_CPP_BACKEND=vulkan → Vulkan build
 *   LLAMA_CPP_BACKEND=rocm   → ROCm 7.2 build
 *   LLAMA_CPP_BACKEND=cpu    → CPU build
 *
 * Binary is stored at: <this-dir>/llama-cpp/<backend>/llama-server
 */

import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  chmodSync,
  copyFileSync,
  existsSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Recursively copy a directory tree, preserving structure */
async function copyRecursive(src, dest) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
      // Preserve executable permissions
      const stats = statSync(srcPath);
      if (stats.mode & 0o111) {
        chmodSync(destPath, 0o755);
      }
    }
  }
}

const BIN_DIR = path.resolve(__dirname, "..", "bin");
const BINARY_NAME =
  process.platform === "win32" ? "llama-server.exe" : "llama-server";
const BUNDLE_TAG = "b9251"; // llama.cpp release tag — update when new releases ship
const BACKENDS = new Set(["auto", "vulkan", "rocm", "cpu", "custom"]);

const DOWNLOAD_BASE = "https://github.com/ggml-org/llama.cpp/releases/download";

function detectPlatform() {
  const platform = process.platform; // 'linux', 'darwin', 'win32'
  let arch;

  if (platform === "win32") {
    arch = os.arch() === "arm64" ? "arm64" : "x64";
  } else {
    arch = os.arch(); // 'arm64', 'x64'
  }

  return { osName: platform, arch };
}

function normalizeBackend(value) {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "auto";
  return BACKENDS.has(normalized) ? normalized : "auto";
}

function defaultBackend(osName) {
  if (osName === "linux") return "vulkan";
  if (osName === "win32") return "cpu";
  return "auto";
}

function effectiveBackend(backend, osName) {
  const normalized = normalizeBackend(backend);
  return normalized === "auto" ? defaultBackend(osName) : normalized;
}

function getAssetName(tag, backend, osName, arch) {
  const selectedBackend = effectiveBackend(backend, osName);

  if (osName === "linux") {
    if (arch === "arm64") {
      if (selectedBackend === "vulkan")
        return `llama-${tag}-bin-ubuntu-vulkan-arm64.tar.gz`;
      if (selectedBackend === "cpu")
        return `llama-${tag}-bin-ubuntu-arm64.tar.gz`;
      return null;
    }
    if (arch !== "x64") return null;
    if (selectedBackend === "rocm")
      return `llama-${tag}-bin-ubuntu-rocm-7.2-x64.tar.gz`;
    if (selectedBackend === "vulkan")
      return `llama-${tag}-bin-ubuntu-vulkan-x64.tar.gz`;
    if (selectedBackend === "cpu") return `llama-${tag}-bin-ubuntu-x64.tar.gz`;
    return null;
  }

  if (osName === "darwin") {
    if (selectedBackend === "rocm" || selectedBackend === "vulkan") return null;
    if (arch === "arm64") return `llama-${tag}-bin-macos-arm64.tar.gz`;
    if (arch === "x64") return `llama-${tag}-bin-macos-x64.tar.gz`;
    return null;
  }

  if (osName === "win32") {
    if (arch !== "x64") {
      return selectedBackend === "cpu"
        ? `llama-${tag}-bin-win-cpu-arm64.zip`
        : null;
    }
    if (selectedBackend === "rocm")
      return `llama-${tag}-bin-win-hip-radeon-x64.zip`;
    if (selectedBackend === "vulkan")
      return `llama-${tag}-bin-win-vulkan-x64.zip`;
    if (selectedBackend === "cpu") return `llama-${tag}-bin-win-cpu-x64.zip`;
  }

  return null;
}

function findBinaryRoot(dir) {
  if (existsSync(path.join(dir, BINARY_NAME))) {
    return dir;
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = findBinaryRoot(path.join(dir, entry.name));
    if (found) return found;
  }

  return null;
}

async function downloadFile(url, destPath) {
  console.log(`[llama.cpp] Downloading ${path.basename(destPath)}...`);

  try {
    const response = await globalThis.fetch(url);
    if (!response || !response.body) {
      throw new Error("fetch returned no body");
    }
    const fileStream = createWriteStream(destPath);
    // @ts-expect-error — fetch Response body is ReadableStream, not Node stream
    await pipeline(response.body, fileStream);
  } catch (err) {
    console.error(`[llama.cpp] fetch failed: ${err.message}`);
    // Fallback to curl
    try {
      execSync(`curl -fSL -o "${destPath}" "${url}"`, { stdio: "inherit" });
    } catch {
      try {
        execSync(`wget -O "${destPath}" "${url}"`, { stdio: "inherit" });
      } catch {
        throw new Error(
          `Failed to download ${path.basename(destPath)}. Install curl or wget and retry.`,
        );
      }
    }
  }
}

function extractTarGz(tarballPath, targetDir) {
  console.log(`[llama.cpp] Extracting...`);
  execSync(`tar xzf "${tarballPath}" -C "${targetDir}"`, { stdio: "inherit" });
}

function extractZip(zipPath, targetDir) {
  console.log(`[llama.cpp] Extracting...`);
  execSync(`unzip -o "${zipPath}" -d "${targetDir}"`, { stdio: "inherit" });
}

async function main() {
  const detected = detectPlatform();
  if (!detected) {
    console.log("[llama.cpp] Unsupported platform — skipping binary download.");
    return;
  }

  const { osName, arch } = detected;
  const configuredBackend = normalizeBackend(process.env.LLAMA_CPP_BACKEND);
  if (configuredBackend === "custom") {
    console.log(
      "[llama.cpp] Custom backend selected — skipping binary download.",
    );
    return;
  }
  const selectedBackend = effectiveBackend(configuredBackend, osName);

  if (!["linux", "darwin", "win32"].includes(osName)) {
    console.log(`[llama.cpp] No prebuilt binary for ${osName} — skipping.`);
    return;
  }

  const assetName = getAssetName(BUNDLE_TAG, selectedBackend, osName, arch);
  if (!assetName) {
    console.log(
      `[llama.cpp] No ${selectedBackend} prebuilt binary for ${osName} ${arch}. ` +
        `You can set LLAMA_CPP_BINARY to point to a llama-server build.`,
    );
    return;
  }

  const installDir = path.join(BIN_DIR, "llama-cpp", selectedBackend);
  const downloadUrl = `${DOWNLOAD_BASE}/${BUNDLE_TAG}/${assetName}`;
  const tarballPath = path.join(os.tmpdir(), assetName);

  // Check if we already have the binary and it matches the expected tag
  const existingBinary = path.join(installDir, BINARY_NAME);
  if (existsSync(existingBinary)) {
    try {
      const versionOutput = execSync(`"${existingBinary}" --version`, {
        encoding: "utf-8",
      }).trim();
      if (versionOutput.includes(BUNDLE_TAG)) {
        console.log(
          `[llama.cpp] Bundled binary already up to date (${BUNDLE_TAG}).`,
        );
        // Clean up any leftover tarballs from previous runs
        try {
          unlinkSync(tarballPath);
        } catch {
          /* ignore */
        }
        return;
      }
    } catch {
      // Binary exists but can't read version — redownload
    }
  }

  try {
    // Download
    mkdirSync(installDir, { recursive: true });
    await downloadFile(downloadUrl, tarballPath);

    // Extract
    const extractDir = path.join(
      os.tmpdir(),
      `llama-cpp-extract-${Date.now()}`,
    );
    mkdirSync(extractDir, { recursive: true });

    if (assetName.endsWith(".zip")) {
      extractZip(tarballPath, extractDir);
    } else {
      extractTarGz(tarballPath, extractDir);
    }

    const sourceDir = findBinaryRoot(extractDir) || extractDir;
    rmSync(installDir, { recursive: true, force: true });
    mkdirSync(installDir, { recursive: true });
    await copyRecursive(sourceDir, installDir);
    console.log(
      `[llama.cpp] Installed ${selectedBackend} ${BINARY_NAME} and shared libraries to ${installDir}`,
    );

    // Write version marker for update checker
    writeFileSync(path.join(installDir, ".llama-cpp-version"), BUNDLE_TAG);

    // Cleanup
    unlinkSync(tarballPath);
    rmSync(extractDir, { recursive: true, force: true });
  } catch (err) {
    console.error(
      `[llama.cpp] Failed to install bundled binary: ${err.message}`,
    );
    console.log(
      "[llama.cpp] You can set LLAMA_CPP_BINARY to point to a llama-server build.",
    );
    // Clean up partial downloads
    try {
      unlinkSync(tarballPath);
    } catch {
      /* ignore */
    }
  }
}

main();
