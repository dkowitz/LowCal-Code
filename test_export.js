import fs from 'fs';
import path from 'path';

// Create a mock history for testing
const mockHistory = [
  { type: "user", text: "First user message" },
  { type: "user", text: "Second user message" },
  { type: "user", text: "Third user message" },
  { type: "info", text: "Some info message" },
  { type: "gemini", text: "First assistant response" },
  { type: "gemini_content", text: "Second assistant response" },
  { type: "user", text: "Fourth user message" },
  { type: "gemini", text: "Third assistant response" },
  { type: "gemini_content", text: "Fourth assistant response" }
];

// Create a mock context
const mockContext = {
  ui: {
    getHistory: () => mockHistory,
    addItem: (item, timestamp) => {
      console.log(`[${item.type}] ${item.text}`);
    }
  },
  services: {
    config: {
      getSessionId: () => "test-session-id"
    }
  }
};

// Create reports directory if it doesn't exist
const reportsDir = path.join(process.cwd(), "reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Import and test the export command
async function testExportCommand() {
  try {
    // Dynamically import the export command
    const { exportCommand } = await import('./packages/cli/dist/src/ui/commands/exportCommand.js');
    
    // Test the report option
    console.log("Testing export command with 'report' option...");
    await exportCommand.action(mockContext, "report test_report.md");
    
    // Check if the file was created
    const reportPath = path.join(reportsDir, "test_report.md");
    if (fs.existsSync(reportPath)) {
      console.log("✅ Report file created successfully!");
      const content = fs.readFileSync(reportPath, 'utf8');
      console.log("Report content:");
      console.log(content);
    } else {
      console.log("❌ Report file was not created.");
    }
  } catch (error) {
    console.error("Error testing export command:", error);
  }
}

testExportCommand();