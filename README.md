# Employee Onboarding MCP Server

An Model Context Protocol (MCP) server that guides new employees through the onboarding process using AI assistants. This server provides interactive (via Cline in VS Code), step-by-step onboarding workflows with progress tracking and configurable content.

This is currently modeled for Dialtone, but can be adopted to any team.

#### 🛠️ Features
- **Interactive Onboarding**: AI-guided step-by-step process for new employees
- **Progress Tracking**: Persistent storage of employee progress across sessions (locally), with scope to central hosting and tracking in the future.
- **Configurable Workflows**: HTML-based configuration files for each onbaording step.
- **Auto-Detection**: Automatic employee identification using corporate credentials



## 🚀 Getting Started
### Prerequisites

- Signup for GitHub Copilot [aka.ms/copilot](https://aka.ms/copilot)
- VS Code with Cline extension [aka.ms/cline](https://aka.ms/cline)

### Installation

1. **Clone or download this repository**
2. **Run the setup script:**
   ```powershell
   .\scripts\setup.ps1
   ```
3. **Restart VSCode**
4. **Start chatting in Cline:** "Help me start my onboarding process"

That's it! The setup script handles everything automatically.

## 💬 Usage Examples

### For New Employees

```
You: "I'm starting my onboarding today"
AI: "Welcome! Let me initialize your onboarding process..."

You: "What's my current step?"
AI: "You're on Step 2: SAW Device Request. Here's what you need to do..."

You: "Help me request a SAW device"
AI: "I'll help you submit a SAW device request. What type of device do you need?"
```

### For Onboarding Buddies

```
You: "Show me all employees I'm mentoring"
AI: "Here are your mentees and their progress..."

You: "How is John Doe doing with onboarding?"
AI: "John is on Step 3 with 67% completion. He completed account setup and SAW device request..."
```


## 📁 Configuration

### HTML Step Configuration

Steps are configured using markdown/html files in `config/steps/`:
**For Onboarding Buddies**: This folder is where you can add your team specific on-boarding steps in html format.
- Edit HTML/Markdown files in config/steps/ to customize onboarding steps
- Update resource files in config/resources/ to add new links/videos or even use a url.

```html
<div class="onboarding-step" data-step-id="1" data-step-type="account_setup">
  <h2>Account Setup</h2>
  <p>Set up your basic company accounts...</p>
  
  <div class="instructions">
    <h3>What You Need to Do:</h3>
    <ol>
      <li>Visit <a href="https://portal.company.com">Company Portal</a></li>
      <li>Complete security setup...</li>
    </ol>
  </div>
  
  <div class="completion-criteria">
    <h3>This step is complete when:</h3>
    <ul>
      <li>✅ You can log into the company portal</li>
    </ul>
  </div>
</div>
```

## 🏗️ Architecture

```
employee-onboarding-mcp/
├── src/                          # TypeScript source code
│   ├── index.ts                  # Main MCP server
│   └── utils/
│       ├── employee-identifier.ts # Employee detection & profiles
│       └── config-parser.ts      # HTML configuration parser
├── config/                       # HTML configuration files
│   ├── steps/                    # Onboarding step definitions
│   ├── resources/                # Wiki links, videos, etc.
├── data/                         # Employee progress data
│   ├── employees/                # Individual progress files
│   └── backups/                  # Automated backups
└── scripts/                      # Setup and utility scripts
```
This Employee Onboarding MCP server is built on the Model Context Protocol (MCP) standard, which enables AI assistants to communicate with external tools and data sources through a standardized `JSON-RPC` interface. The server runs as a local `Node.js` process on your machine, storing employee data in local `JSON` files while exposing 9 specialized tools (like `start_onboarding, complete_step`) that Cline can invoke through the MCP SDK.



## 🔧 Development

#### Building

```bash
npm install
npm run build
```

#### Manual Configuration

If you prefer manual setup, add to your MCP settings:

**Cline (VS Code):**
```json
{
  "mcpServers": {
    "employee-onboarding": {
      "command": "node",
      "args": ["C:/path/to/employee-onboarding-mcp/build/index.js"],
      "env": {
        "ONBOARDING_DATA_PATH": "C:/path/to/data",
        "ONBOARDING_CONFIG_PATH": "C:/path/to/config"
      }
    }
  }
}
```

## 📊 Data Storage

- **Employee profiles**: JSON files in `data/employees/`
- **Progress tracking**: Automatic timestamps and completion status
- **Backups**: Daily automated backups to `data/backups/`
- **Privacy**: Data stored locally, not transmitted externally

## 🔍 Troubleshooting

### Common Issues

**"Employee registration required"**
- Run: `register_employee` tool with your email and name

**TypeScript compilation errors**
- Ignore them - they don't affect functionality
- Or install dependencies: `npm install`

**MCP server not connecting**
- Check that Node.js is installed
- Verify the build path in MCP settings
- Restart your AI assistant

**No onboarding steps found**
- Ensure `config/steps/` contains HTML files
- Check file naming: `step-1-*.html`, `step-2-*.html`, etc.

**Happy Onboarding! 🎉**
---
#### 📜 License
MIT License - Feel free to customize for your organization's needs.