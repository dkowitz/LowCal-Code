import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { setOpenAIApiKey } from "../auth.js";

// Simple smoke test for env persistence behavior
describe("env persistence", () => {
  test("writes to discovered .env file and returns the path", () => {
    const workspaceDir = fs.mkdtempSync(path.join(tmpdir(), "qwen-work-"));
    const geminiDir = path.join(workspaceDir, ".qwen");
    fs.mkdirSync(geminiDir, { recursive: true });
    const envPath = path.join(geminiDir, ".env");

    // Ensure no env exists initially
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath);

    // Change cwd to workspace and call setter
    const prevCwd = process.cwd();
    try {
      process.chdir(workspaceDir);
      const returned = setOpenAIApiKey("test-key-123");
      // returned should be the envPath where file was created
      expect(returned).toBe(envPath);
      expect(fs.existsSync(envPath)).toBe(true);
      const contents = fs.readFileSync(envPath, "utf-8");
      expect(contents).toContain("OPENAI_API_KEY=test-key-123");
    } finally {
      process.chdir(prevCwd);
      // cleanup
      try {
        fs.unlinkSync(envPath);
      } catch (_e) {
        /* ignore */
      }
      try {
        fs.rmdirSync(geminiDir);
      } catch (_e) {
        /* ignore */
      }
      try {
        fs.rmdirSync(workspaceDir);
      } catch (_e) {
        /* ignore */
      }
    }
  });
});
