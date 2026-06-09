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
import { getEffectiveLlamaCppBackend, getLlamaCppBackendAssetName, normalizeLlamaCppBackend, } from "@qwen-code/qwen-code-core";
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
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
function getConfigDir() {
    const home = os.homedir();
    return path.join(home, ".qwen");
}
/**
 * Get the path to the update check cache file.
 */
function getCachePath() {
    return path.join(getConfigDir(), "llama-cpp-update-cache.json");
}
/**
 * Detect the current platform and architecture for binary selection.
 * Mirrors the logic in postinstall.js.
 */
function detectPlatform() {
    const platform = process.platform; // 'linux', 'darwin', 'win32'
    let arch;
    if (platform === "win32") {
        arch = os.arch() === "arm64" ? "arm64" : "x64";
    }
    else {
        arch = os.arch();
    }
    return { osName: platform, arch };
}
/**
 * Get the platform-specific asset name for a given release tag.
 */
function getConfiguredBackend(backend) {
    return normalizeLlamaCppBackend(backend ?? process.env["LLAMA_CPP_BACKEND"]);
}
/**
 * Get the current bundled llama.cpp tag from the installed marker file.
 * Written by postinstall.js alongside the binary.
 */
function getCoreBinDir() {
    const configuredBinDir = process.env["LLAMA_CPP_BIN_DIR"];
    if (configuredBinDir) {
        return configuredBinDir;
    }
    const candidates = [
        path.resolve(moduleDir, "..", "..", "..", "core", "bin"),
        path.resolve(moduleDir, "..", "..", "..", "..", "core", "bin"),
        path.resolve(moduleDir, "..", "..", "core", "bin"),
        path.resolve(moduleDir, "..", "..", "..", "bin"),
        path.resolve(moduleDir, "..", "packages", "core", "bin"),
        path.resolve(moduleDir, "packages", "core", "bin"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, "llama-cpp")) ||
            fs.existsSync(path.join(candidate, ".llama-cpp-version"))) {
            return candidate;
        }
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}
function getBackendBinDir(backend) {
    const effectiveBackend = getEffectiveLlamaCppBackend(backend);
    return path.join(getCoreBinDir(), "llama-cpp", effectiveBackend);
}
function readMarker(markerPath) {
    if (!fs.existsSync(markerPath))
        return null;
    try {
        return fs.readFileSync(markerPath, "utf-8").trim();
    }
    catch {
        return null;
    }
}
function getCurrentTag(backend) {
    if (backend !== "custom") {
        const backendMarker = path.join(getBackendBinDir(backend), ".llama-cpp-version");
        const backendTag = readMarker(backendMarker);
        if (backendTag)
            return backendTag;
    }
    // Backward-compatible bundled install location used by postinstall.js.
    if (getEffectiveLlamaCppBackend(backend) === "vulkan") {
        const legacyTag = readMarker(path.join(getCoreBinDir(), ".llama-cpp-version"));
        if (legacyTag)
            return legacyTag;
    }
    const binaryPath = process.env["LLAMA_CPP_BINARY"] ||
        path.join(getBackendBinDir(backend), process.platform === "win32" ? "llama-server.exe" : "llama-server");
    if (!fs.existsSync(binaryPath))
        return null;
    try {
        const output = execSync(`"${binaryPath}" --version`, {
            encoding: "utf-8",
            timeout: 3000,
        });
        const match = output.match(/\b(\d{4,})\b/);
        return match ? `b${match[1]}` : null;
    }
    catch {
        return null;
    }
}
/**
 * Fetch the latest release from GitHub with a timeout.
 * Returns null on timeout or error.
 */
async function fetchLatestRelease() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(GITHUB_API_URL, {
            headers: {
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "LowCalCode",
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            return null;
        }
        const data = (await response.json());
        return {
            tag: data.tag_name,
            url: data.html_url,
            assets: (data.assets ?? [])
                .map((asset) => asset.name)
                .filter((name) => !!name),
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Read the cached update check result.
 */
function readCache() {
    const cachePath = getCachePath();
    if (!fs.existsSync(cachePath))
        return null;
    try {
        const content = fs.readFileSync(cachePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Write the update check result to disk cache.
 */
function writeCache(latestTag, backend, assetName, releaseUrl, dismissedTag) {
    const cacheDir = getConfigDir();
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cache = {
        latestTag,
        backend,
        assetName,
        releaseUrl,
        dismissedTag,
        checkedAt: Date.now(),
        platformKey: `${process.platform}-${os.arch()}`,
    };
    try {
        fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2));
    }
    catch {
        // Cache write failure is non-critical
    }
}
export function dismissLlamaCppUpdate(updateInfo) {
    writeCache(updateInfo.latestTag, updateInfo.backend, updateInfo.assetName, updateInfo.releaseUrl, updateInfo.latestTag);
}
/**
 * Check if an update is available for llama.cpp.
 * Uses a 24-hour disk cache to avoid unnecessary API calls.
 *
 * @returns Update info if a newer version is available, null otherwise.
 */
export async function checkForLlamaCppUpdate(force = false, requestedBackend) {
    const detected = detectPlatform();
    if (!detected)
        return null;
    const backend = getConfiguredBackend(requestedBackend);
    if (backend === "custom") {
        return null;
    }
    // Check cache first
    const cache = force ? null : readCache();
    if (cache) {
        const age = Date.now() - cache.checkedAt;
        const isStale = age > CACHE_LIFETIME_MS ||
            cache.platformKey !== `${detected.osName}-${detected.arch}` ||
            normalizeLlamaCppBackend(cache.backend) !== backend;
        if (!isStale) {
            const currentTag = getCurrentTag(backend);
            if (cache.latestTag === currentTag) {
                return null;
            }
            if (cache.dismissedTag === cache.latestTag) {
                return null;
            }
            if (cache.assetName) {
                return {
                    latestTag: cache.latestTag,
                    currentTag: currentTag ?? "not installed",
                    backend,
                    assetName: cache.assetName,
                    releaseUrl: cache.releaseUrl ||
                        `https://github.com/${GITHUB_REPO}/releases/tag/${cache.latestTag}`,
                    message: `llama.cpp ${backend} update available: ${cache.latestTag}`,
                };
            }
            return null;
        }
    }
    // Fetch latest release from GitHub
    const latest = await fetchLatestRelease();
    if (!latest)
        return null;
    // Get the asset name for this platform — this also validates we have a supported platform
    const preferredAsset = getLlamaCppBackendAssetName(latest.tag, backend, detected.osName, detected.arch);
    const assetName = pickReleaseAsset(preferredAsset, latest.assets, backend, detected);
    if (!assetName)
        return null;
    // Compare with current bundled tag
    const currentTag = getCurrentTag(backend);
    // Check if there's actually a newer version by comparing tags
    // llama.cpp uses format like "b9159" — simple string comparison works for these hashes
    const needsUpdate = !currentTag || latest.tag !== currentTag;
    if (cache?.dismissedTag === latest.tag) {
        return null;
    }
    if (!needsUpdate) {
        // No update available — clear stale cache to avoid repeated checks
        if (cache) {
            try {
                fs.unlinkSync(getCachePath());
            }
            catch {
                /* ignore */
            }
        }
        return null;
    }
    // Cache release metadata so restarts can show the prompt without another API call.
    writeCache(latest.tag, backend, assetName, latest.url);
    return {
        latestTag: latest.tag,
        currentTag: currentTag ?? "not installed",
        backend,
        assetName,
        releaseUrl: latest.url,
        message: `llama.cpp ${backend} update available: ${latest.tag}`,
    };
}
function pickReleaseAsset(preferredAsset, releaseAssets, backend, detected) {
    if (preferredAsset && releaseAssets.includes(preferredAsset)) {
        return preferredAsset;
    }
    if (!preferredAsset) {
        return null;
    }
    const effectiveBackend = getEffectiveLlamaCppBackend(backend);
    if (detected.osName === "linux" && detected.arch === "x64") {
        if (effectiveBackend === "rocm") {
            return (releaseAssets.find((asset) => /ubuntu-rocm-7\.2-x64\.tar\.gz$/.test(asset)) ||
                releaseAssets.find((asset) => /ubuntu-rocm.*gfx1151.*x64\.(zip|tar\.gz)$/.test(asset)) ||
                null);
        }
        if (effectiveBackend === "vulkan") {
            return (releaseAssets.find((asset) => /ubuntu-vulkan-x64\.tar\.gz$/.test(asset)) ?? null);
        }
        if (effectiveBackend === "cpu") {
            return (releaseAssets.find((asset) => /ubuntu-x64\.tar\.gz$/.test(asset)) ??
                null);
        }
    }
    if (detected.osName === "win32" && detected.arch === "x64") {
        if (effectiveBackend === "rocm") {
            return (releaseAssets.find((asset) => /win-hip-radeon-x64\.zip$/.test(asset)) ??
                null);
        }
        if (effectiveBackend === "vulkan") {
            return (releaseAssets.find((asset) => /win-vulkan-x64\.zip$/.test(asset)) ??
                null);
        }
        if (effectiveBackend === "cpu") {
            return (releaseAssets.find((asset) => /win-cpu-x64\.zip$/.test(asset)) ?? null);
        }
    }
    return null;
}
/**
 * Download and install the latest llama.cpp binary.
 * Reuses the download/extract logic from postinstall.js.
 *
 * @returns true if installation succeeded, false otherwise.
 */
export async function installLlamaCppUpdate() {
    const detected = detectPlatform();
    if (!detected)
        return false;
    const cache = readCache();
    if (!cache)
        return false;
    const backend = normalizeLlamaCppBackend(cache.backend);
    const assetName = cache.assetName ||
        getLlamaCppBackendAssetName(cache.latestTag, backend, detected.osName, detected.arch);
    if (!assetName)
        return false;
    const downloadUrl = `${DOWNLOAD_BASE}/${cache.latestTag}/${assetName}`;
    const binDir = getBackendBinDir(backend);
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
        const [{ Readable }, { pipeline }] = await Promise.all([
            import("node:stream"),
            import("node:stream/promises"),
        ]);
        const body = response.body;
        await pipeline(Readable.fromWeb(body), fileStream);
        console.log(`[llama.cpp] Extracting to ${binDir}...`);
        const extractDir = path.join(os.tmpdir(), `llama-cpp-extract-${Date.now()}`);
        fs.mkdirSync(extractDir, { recursive: true });
        if (assetName.endsWith(".zip")) {
            execSync(`unzip -o "${tarballPath}" -d "${extractDir}"`, {
                stdio: "inherit",
            });
        }
        else {
            execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, {
                stdio: "inherit",
            });
        }
        await copyExtractedBinaryTree(extractDir, binDir);
        fs.writeFileSync(path.join(binDir, ".llama-cpp-version"), cache.latestTag);
        // Clean up
        fs.unlinkSync(tarballPath);
        fs.rmSync(extractDir, { recursive: true, force: true });
        // Clear the cache since we've installed the update
        try {
            fs.unlinkSync(getCachePath());
        }
        catch {
            /* ignore */
        }
        console.log(`[llama.cpp] Update installed successfully.`);
        return true;
    }
    catch (err) {
        console.error(`[llama.cpp] Update failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fallback to curl/wget
        try {
            const tarballPath = path.join(os.tmpdir(), assetName);
            execSync(`curl -fSL -o "${tarballPath}" "${downloadUrl}"`, {
                stdio: "inherit",
            });
            const extractDir = path.join(os.tmpdir(), `llama-cpp-extract-${Date.now()}`);
            fs.mkdirSync(extractDir, { recursive: true });
            if (assetName.endsWith(".zip")) {
                execSync(`unzip -o "${tarballPath}" -d "${extractDir}"`, {
                    stdio: "inherit",
                });
            }
            else {
                execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, {
                    stdio: "inherit",
                });
            }
            await copyExtractedBinaryTree(extractDir, binDir);
            fs.writeFileSync(path.join(binDir, ".llama-cpp-version"), cache.latestTag);
            fs.unlinkSync(tarballPath);
            fs.rmSync(extractDir, { recursive: true, force: true });
            try {
                fs.unlinkSync(getCachePath());
            }
            catch {
                /* ignore */
            }
            console.log(`[llama.cpp] Update installed successfully (via curl).`);
            return true;
        }
        catch (fallbackErr) {
            console.error(`[llama.cpp] Fallback install also failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`);
            return false;
        }
    }
}
/**
 * Recursively copy a directory tree, preserving structure and permissions.
 */
async function copyRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyRecursive(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
            const stats = fs.statSync(srcPath);
            if (stats.mode & 0o111) {
                fs.chmodSync(destPath, 0o755);
            }
        }
    }
}
function findBinaryRoot(dir) {
    const binaryName = process.platform === "win32" ? "llama-server.exe" : "llama-server";
    if (fs.existsSync(path.join(dir, binaryName))) {
        return dir;
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const found = findBinaryRoot(path.join(dir, entry.name));
        if (found) {
            return found;
        }
    }
    return null;
}
async function copyExtractedBinaryTree(extractDir, binDir) {
    const sourceDir = findBinaryRoot(extractDir) ?? extractDir;
    fs.rmSync(binDir, { recursive: true, force: true });
    fs.mkdirSync(binDir, { recursive: true });
    await copyRecursive(sourceDir, binDir);
}
//# sourceMappingURL=llamaCppUpdateChecker.js.map