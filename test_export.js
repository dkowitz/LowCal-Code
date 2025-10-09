#!/usr/bin/env node

// Simple test to understand export command behavior
import fs from 'node:fs';
import path from 'node:path';

console.log('Testing export command file path resolution...');

// Test the path resolution logic from the export command
const exportDir = path.join(process.cwd(), "reports");
console.log('Export directory:', exportDir);

const fileName = "token_tool.md";
const fullPath = path.join(exportDir, fileName);
console.log('Full path:', fullPath);

// Check if directory exists
console.log('Reports directory exists:', fs.existsSync(exportDir));

// Try to create directory and write file
try {
    fs.mkdirSync(exportDir, { recursive: true });
    console.log('Directory created or already exists');
    
    const testContent = '# Test Content\n\nThis is a test file.';
    fs.writeFileSync(fullPath, testContent, 'utf8');
    console.log('File written successfully to:', fullPath);
    console.log('File exists:', fs.existsSync(fullPath));
    
    // Clean up
    fs.unlinkSync(fullPath);
    console.log('Test file deleted');
} catch (error) {
    console.error('Error:', error.message);
}