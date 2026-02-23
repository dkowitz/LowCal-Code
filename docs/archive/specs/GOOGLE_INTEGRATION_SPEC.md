# Google Workspace Integration Specification for LowCal Code

**Version:** 1.0  
**Date:** February 17, 2026  
**Status:** Draft Specification  

---

## 📋 Executive Summary

This document outlines the architecture and implementation plan for integrating Google Workspace services (Gmail, Drive, Calendar, Contacts) into LowCal Code. The integration will enable the AI assistant to interact with user's email, files, calendar events, and contacts through natural language commands.

> *"The Empire had its droids—this is our rebellion against information silos."*

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LowCal Code CLI                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  User Request    │  │  Tool Selection  │  │  Auth Manager    │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘   │
└───────────┼─────────────────────┼─────────────────────┼────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Google Integration Layer                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  Gmail Tool      │  │  Drive Tool      │  │  Calendar Tool   │   │
│  │  (gmail.ts)      │  │  (drive.ts)      │  │  (calendar.ts)   │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                     │                     │             │
│  ┌────────┴─────────────────────┴─────────────────────┴─────────┐   │
│  │                    Google API Client                         │   │
│  │              (googleapis + local-auth)                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Google API Services                              │
│  Gmail API | Drive API v3 | Calendar API v3 | People API          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication & Authorization

### OAuth 2.0 Flow (Installed Application)

| Component | Implementation |
|-----------|----------------|
| **Library** | `@google-cloud/local-auth` + `googleapis` |
| **Flow Type** | Authorization Code Flow with PKCE |
| **Redirect URI** | Loopback IP (`http://127.0.0.1:PORT`) |
| **Token Storage** | User settings directory (platform-specific) |

### Token Management

```typescript
// Token storage location (platform-specific)
macOS/Linux: ~/.config/qwen-code/google-tokens/
Windows:     %APPDATA%\qwen-code\google-tokens\
```

#### Token Files

| File | Purpose |
|------|---------|
| `credentials.json` | OAuth 2.0 client credentials (user-provided) |
| `token.json` | Access + refresh tokens (auto-generated) |

### Required Scopes by Service

| Service | Read-Only Scope | Read/Write Scope |
|---------|-----------------|------------------|
| **Gmail** | `https://www.googleapis.com/auth/gmail.readonly` | `https://www.googleapis.com/auth/gmail.modify`, `https://www.googleapis.com/auth/gmail.send` |
| **Drive** | `https://www.googleapis.com/auth/drive.readonly` | `https://www.googleapis.com/auth/drive` |
| **Calendar** | `https://www.googleapis.com/auth/calendar.readonly` | `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/calendar` |
| **Contacts** | `https://www.googleapis.com/auth/contacts.readonly` | `https://www.googleapis.com/auth/contacts` |

### User Configuration

Users configure Google integration via settings:

```json
{
  "google": {
    "enabled": true,
    "credentialsPath": "~/.config/qwen-code/google-credentials.json",
    "defaultScopes": ["gmail.readonly", "drive.readonly", "calendar.readonly"]
  }
}
```

---

## 🛠️ Tool Implementation

### Base Interface

All Google tools extend `DeclarativeTool` and follow the new tool pattern:

```typescript
export abstract class DeclarativeTool<TParams, TResult> implements ToolBuilder<TParams, TResult> {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: Kind; // e.g., Kind.Read, Kind.Write, Kind.Network
  readonly parameterSchema: unknown;
  
  abstract build(params: TParams): ToolInvocation<TParams, TResult>;
}
```

### Tool Registration

Tools are registered in the `ToolRegistry` with appropriate `Kind` values:

| Kind | Description |
|------|-------------|
| `Kind.Read` | Non-destructive read operations (list emails, files) |
| `Kind.Write` | Modifications that don't delete (create/update) |
| `Kind.Delete` | Deletion operations |
| `Kind.Network` | Network calls requiring explicit approval |

---

## 📧 Gmail Tool Specification

### Tool: `GmailReadLabels`

**Purpose:** List all labels in user's Gmail account

**Parameters:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Returns:** Array of label objects with name and ID

---

### Tool: `GmailListMessages`

**Purpose:** List messages matching query criteria

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Gmail search query" },
    "maxResults": { "type": "integer", "minimum": 1, "maximum": 500, "default": 20 },
    "labelIds": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["query"]
}
```

**Returns:** Array of message summaries (id, threadId, snippet)

---

### Tool: `GmailGetMessage`

**Purpose:** Retrieve full message content

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "messageId": { "type": "string" },
    "format": { "type": "string", "enum": ["full", "metadata", "raw"], "default": "full" }
  },
  "required": ["messageId"]
}
```

**Returns:** Complete message with headers, body, attachments

---

### Tool: `GmailSendEmail`

**Purpose:** Send email from user's account

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "to": { "type": "string", "description": "Comma-separated recipients" },
    "subject": { "type": "string" },
    "body": { "type": "string" },
    "cc": { "type": "string" },
    "bcc": { "type": "string" }
  },
  "required": ["to", "subject", "body"]
}
```

**Returns:** Sent message metadata

---

### Tool: `GmailCreateDraft`

**Purpose:** Create a draft email

**Parameters:** Same as `GmailSendEmail` (optional `to`, `subject`, `body`)

**Returns:** Draft message with ID

---

## 📁 Drive Tool Specification

### Tool: `DriveListFiles`

**Purpose:** List files in Google Drive

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Search query (e.g., 'name contains \"report\"')" },
    "folderId": { "type": "string", "description": "Parent folder ID" },
    "maxResults": { "type": "integer", "minimum": 1, "maximum": 1000, "default": 50" },
    "fields": { "type": "string", "description": "Comma-separated fields to return" }
  }
}
```

**Returns:** Array of file objects (id, name, mimeType, size, createdTime)

---

### Tool: `DriveReadFile`

**Purpose:** Download and read file content

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "fileId": { "type": "string" },
    "mimeType": { "type": "string", "description": "Export MIME type for Google Workspace docs" }
  },
  "required": ["fileId"]
}
```

**Returns:** File content as string (text) or base64 (binary)

---

### Tool: `DriveSearchFiles`

**Purpose:** Advanced file search with filters

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "nameContains": { "type": "string" },
    "mimeType": { "type": "string" },
    "folderId": { "type": "string" },
    "modifiedSince": { "type": "string", "format": "date-time" }
  }
}
```

**Returns:** Array of matching files

---

### Tool: `DriveUploadFile`

**Purpose:** Upload file to Drive

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "filePath": { "type": "string", "description": "Local file path" },
    "folderId": { "type": "string", "description": "Parent folder ID (optional)" },
    "mimeType": { "type": "string" }
  },
  "required": ["filePath"]
}
```

**Returns:** Uploaded file metadata

---

### Tool: `DriveCreateFolder`

**Purpose:** Create a new folder in Drive

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "parentId": { "type": "string", "description": "Parent folder ID (optional)" }
  },
  "required": ["name"]
}
```

**Returns:** Folder metadata

---

## 📅 Calendar Tool Specification

### Tool: `CalendarListCalendars`

**Purpose:** List all calendars accessible to user

**Parameters:**
```json
{
  "type": "object",
  "properties": {}
}
```

**Returns:** Array of calendar objects (id, summary, description)

---

### Tool: `CalendarListEvents`

**Purpose:** List events on a calendar

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "calendarId": { "type": "string", "default": "primary" },
    "timeMin": { "type": "string", "format": "date-time" },
    "timeMax": { "type": "string", "format": "date-time" },
    "maxResults": { "type": "integer", "minimum": 1, "maximum": 2500", "default": 100 },
    "singleEvents": { "type": "boolean", "default": true }
  }
}
```

**Returns:** Array of event objects

---

### Tool: `CalendarGetEvent`

**Purpose:** Retrieve detailed event information

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "calendarId": { "type": "string", "default": "primary" },
    "eventId": { "type": "string" }
  },
  "required": ["eventId"]
}
```

**Returns:** Complete event object

---

### Tool: `CalendarCreateEvent`

**Purpose:** Create a new calendar event

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "calendarId": { "type": "string", "default": "primary" },
    "summary": { "type": "string" },
    "description": { "type": "string" },
    "start": { "type": "string", "format": "date-time" },
    "end": { "type": "string", "format": "date-time" },
    "attendees": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "start", "end"]
}
```

**Returns:** Created event metadata

---

### Tool: `CalendarUpdateEvent`

**Purpose:** Update an existing event

**Parameters:** Same as `CalendarCreateEvent` + `eventId`

**Returns:** Updated event object

---

## 👥 Contacts Tool Specification (People API)

### Tool: `ContactsListConnections`

**Purpose:** List user's contacts

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "pageSize": { "type": "integer", "minimum": 1, "maximum": 500", "default": 100 },
    "personFields": { "type": "string", "default": "names,emailAddresses" }
  }
}
```

**Returns:** Array of contact objects

---

### Tool: `ContactsSearch`

**Purpose:** Search contacts by name or email

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "personFields": { "type": "string", "default": "names,emailAddresses,phoneNumbers" }
  },
  "required": ["query"]
}
```

**Returns:** Matching contacts

---

### Tool: `ContactsGetContact`

**Purpose:** Retrieve detailed contact information

**Parameters:**
```json
{
  "type": "object",
  "properties": {
    "resourceName": { "type": "string", "description": "Contact resource name (e.g., 'people/123')" },
    "personFields": { "type": "string" }
  },
  "required": ["resourceName"]
}
```

**Returns:** Complete contact object

---

## 🔧 Implementation Details

### File Structure

```
packages/core/src/tools/
├── google/
│   ├── index.ts              # Export all Google tools
│   ├── auth.ts               # OAuth2 client management
│   ├── client-manager.ts     # Google API client factory
│   ├── types.ts              # Shared TypeScript types
│   ├── gmail.ts              # Gmail tool implementations
│   ├── drive.ts              # Drive tool implementations
│   ├── calendar.ts           # Calendar tool implementations
│   └── contacts.ts           # Contacts tool implementations
```

### Auth Module (`google/auth.ts`)

```typescript
export class GoogleAuthManager {
  private client: OAuth2Client | null = null;
  
  async initialize(credentialsPath: string): Promise<void>
  async getClient(): Promise<OAuth2Client>
  async refreshToken(): Promise<void>
  async revokeTokens(): Promise<void>
}
```

### Client Manager (`google/client-manager.ts`)

```typescript
export class GoogleApiClientManager {
  private authManager: GoogleAuthManager;
  
  getGmailClient(): google.gmail.Gmail
  getDriveClient(): google.drive.Drive
  getCalendarClient(): google.calendar.Calendar
  getPeopleClient(): google.people.People
}
```

---

## 📦 Dependencies

### Package.json Additions

```json
{
  "dependencies": {
    "googleapis": "^134.0.0",
    "@google-cloud/local-auth": "^2.1.0"
  },
  "devDependencies": {
    "@types/google__local-auth": "^2.0.3"
  }
}
```

---

## 🚀 User Onboarding Flow

### Step 1: Enable Google Integration

User runs command or sets config:
```bash
# In LowCal REPL
@google enable
```

Or via settings.json:
```json
{
  "google": {
    "enabled": true,
    "credentialsPath": "~/.config/qwen-code/google-credentials.json"
  }
}
```

### Step 2: Configure Credentials

User creates OAuth credentials at [Google Cloud Console](https://console.cloud.google.com/):

1. Create project or select existing
2. Enable APIs (Gmail, Drive, Calendar, People)
3. Configure OAuth consent screen
4. Create Desktop application credentials
5. Download `credentials.json`

### Step 3: First-Time Authorization

On first tool invocation:
```
[LowCal] Google integration requires authorization.
         Opening browser for Google account sign-in...
         
[Browser opens with Google consent screen]

[User grants permissions]
[Tokens saved to ~/.config/qwen-code/google-tokens/token.json]
```

### Step 4: Tool Usage

```bash
# User request
"Find my emails from last week about the project"

# LowCal response
[Uses GmailListMessages tool with query: "from:* subject:project after:2026-02-10"]
[Returns matching messages]
```

---

## ⚠️ Security Considerations

### Token Storage

| Platform | Storage Location | Permissions |
|----------|------------------|-------------|
| macOS | `~/Library/Application Support/qwen-code/google-tokens/` | 0600 (owner read/write only) |
| Linux | `~/.config/qwen-code/google-tokens/` | 0700 (directory), 0600 (files) |
| Windows | `%APPDATA%\qwen-code\google-tokens\` | ACL: Owner full control |

### Best Practices

1. **Never commit credentials** - `credentials.json` should be in `.gitignore`
2. **Token rotation** - Implement automatic refresh before expiry
3. **Scope minimization** - Request only necessary permissions
4. **Error handling** - Never expose raw error messages to users
5. **Audit logging** - Log tool usage (without sensitive data)

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// google/gmail.test.ts
describe('GmailListMessages', () => {
  it('should list messages matching query', async () => {
    // Mock Google API response
    const mockResponse = { data: { messages: [...] } };
    // Test tool execution
  });
});
```

### Integration Tests

1. **Mock server** - Use `googleapis` test utilities
2. **Real API tests** - With test account (optional, marked as slow)
3. **End-to-end** - User request → tool invocation → response

---

## 📊 Error Handling

| Error Type | HTTP Code | User Message |
|------------|-----------|--------------|
| `unauthorized` | 401/403 | "Google authentication expired. Please re-authorize." |
| `notFound` | 404 | "Resource not found in Google services." |
| `quotaExceeded` | 429 | "Google API quota exceeded. Try again later." |
| `internalError` | 5xx | "Google service temporarily unavailable." |

---

## 🔄 Future Enhancements

### Phase 2 Features

1. **Service Account Support** - For server-to-server authentication
2. **Webhook Notifications** - Real-time Gmail/Calendar updates
3. **Batch Operations** - Efficient multi-resource operations
4. **File Preview** - Inline preview of Drive documents
5. **Email Draft Editing** - Interactive draft creation

### Phase 3 Features

1. **Google Meet Integration** - Create meeting links
2. **Google Tasks** - Task management
3. **Google Keep** - Note-taking integration
4. **Shared Drives** - Team drive support

---

## 📚 References

| Resource | URL |
|----------|-----|
| Google APIs Node.js Client | https://github.com/googleapis/google-api-nodejs-client |
| OAuth 2.0 for Desktop Apps | https://developers.google.com/identity/protocols/oauth2/native-app |
| Gmail API Docs | https://developers.google.com/gmail/api |
| Drive API Docs | https://developers.google.com/drive/api |
| Calendar API Docs | https://developers.google.com/calendar/api |
| People API Docs | https://developers.google.com/people |

---

## 📝 Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-17 | K-6 | Initial specification draft |

---

*"The Force is strong with this one—but it still needs proper OAuth scopes."*
