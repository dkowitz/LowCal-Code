/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * postinstall script — downloads the prebuilt llama.cpp binary for the current platform.
 *
 * This ensures LowCal ships with a working llama-server out of the box,
 * so users don't need to build or install it manually.
 *
 * Platform detection:
 *   Linux x64  → ubuntu-vulkan-x64 (Vulkan backend — best for Strix Halo / AMD GPU)
 *   macOS arm64→ macos-arm64       (Metal backend via ggml-metal)
 *   macOS x64  → macos-x64         (Intel Mac fallback)
 *   Windows x64→ win-x64           (CPU-only; Vulkan on Windows requires separate setup)
 *
 * Binary is stored at: <this-dir>/llama-server
 */

import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync, copyFileSync, existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
const BINARY_NAME = process.platform === "win32" ? "llama-server.exe" : "llama-server";
const BUNDLE_TAG = "b9159"; // llama.cpp release tag — update when new releases ship

// Platform-specific download info
const PLATFORMS = {
  linux: {
    arm64: null, // No prebuilt Vulkan for Linux ARM64 yet
    x64: `llama-${BUNDLE_TAG}-bin-ubuntu-vulkan-x64.tar.gz`,
  },
  darwin: {
    arm64: `llama-${BUNDLE_TAG}-bin-macos-arm64.tar.gz`,
    x64: `llama-${BUNDLE_TAG}-bin-macos-x64.tar.gz`,
  },
  win32: {
    x64: `llama-${BUNDLE_TAG}-bin-win-x64.zip`, // CPU-only — Vulkan on Windows needs manual setup
    arm64: null,
  },
};

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
    } catch (e) {
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
  const platformInfo = PLATFORMS[osName];

  if (!platformInfo) {
    console.log(`[llama.cpp] No prebuilt binary for ${osName} — skipping.`);
    return;
  }

  const assetName = platformInfo[arch];
  if (!assetName) {
    console.log(
      `[llama.cpp] No prebuilt binary for ${osName} ${arch}. ` +
        `You can set LLAMA_CPP_BINARY to point to a llama-server build.`,
    );
    return;
  }

  const downloadUrl = `${DOWNLOAD_BASE}/${BUNDLE_TAG}/${assetName}`;
  const tarballPath = path.join(os.tmpdir(), assetName);

  // Check if we already have the binary and it matches the expected tag
  const existingBinary = path.join(BIN_DIR, BINARY_NAME);
  if (existsSync(existingBinary)) {
    try {
      const versionOutput = execSync(`"${existingBinary}" --version`, { encoding: "utf-8" }).trim();
      if (versionOutput.includes(BUNDLE_TAG)) {
        console.log(`[llama.cpp] Bundled binary already up to date (${BUNDLE_TAG}).`);
        // Clean up any leftover tarballs from previous runs
        try { unlinkSync(tarballPath); } catch { /* ignore */ }
        return;
      }
    } catch {
      // Binary exists but can't read version — redownload
    }
  }

  try {
    // Download
    mkdirSync(BIN_DIR, { recursive: true });
    await downloadFile(downloadUrl, tarballPath);

    // Extract
    const extractDir = path.join(os.tmpdir(), `llama-cpp-extract-${Date.now()}`);
    mkdirSync(extractDir, { recursive: true });

    if (assetName.endsWith(".zip")) {
      extractZip(tarballPath, extractDir);
    } else {
      extractTarGz(tarballPath, extractDir);
    }

    // Copy ALL extracted files into bin/ (the Vulkan build ships with ~30 .so files)
    const entries = readdirSync(extractDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Recursively copy everything from the subdirectory into bin/
        const srcSubdir = path.join(extractDir, entry.name);
        await copyRecursive(srcSubdir, BIN_DIR);
        console.log(`[llama.cpp] Installed ${BINARY_NAME} and all shared libraries to ${BIN_DIR}`);
      }
    }

    // Write version marker for update checker
    writeFileSync(path.join(BIN_DIR, ".llama-cpp-version"), BUNDLE_TAG);

    // Cleanup
    unlinkSync(tarballPath);
    rmSync(extractDir, { recursive: true, force: true });
  } catch (err) {
    console.error(
      `[llama.cpp] Failed to install bundled binary: ${err.message}`,
    );
    console.log("[llama.cpp] You can set LLAMA_CPP_BINARY to point to a llama-server build.");
    // Clean up partial downloads
    try { unlinkSync(tarballPath); } catch { /* ignore */ }
  }
}

main();
