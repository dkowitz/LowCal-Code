#!/usr/bin/env node
const fs = require("fs");
const path = "test-task.log";

function logEntry() {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] Test log entry\n`;
  fs.appendFileSync(path, entry);
  console.log("Logged:", entry.trim());
}

logEntry();
setInterval(logEntry, 60000);

