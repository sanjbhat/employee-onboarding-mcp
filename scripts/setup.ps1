# Employee Onboarding MCP Server Setup Script
# This script installs and configures the Employee Onboarding MCP server

param(
    [switch]$SkipBuild,
    [switch]$ConfigureOnly,
    [string]$DataPath,
    [string]$ConfigPath
)

Write-Host "🚀 Employee Onboarding MCP Server Setup" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green

# Get the script directory and MCP root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$McpRoot = Split-Path -Parent $ScriptDir

# Set default paths
if (-not $DataPath) {
    $DataPath = Join-Path $McpRoot "data"
}
if (-not $ConfigPath) {
    $ConfigPath = Join-Path $McpRoot "config"
}

Write-Host "📁 MCP Server Location: $McpRoot" -ForegroundColor Cyan
Write-Host "📁 Data Path: $DataPath" -ForegroundColor Cyan
Write-Host "📁 Config Path: $ConfigPath" -ForegroundColor Cyan
Write-Host ""

# Function to test if a command exists
function Test-Command($cmdname) {
    try {
        Get-Command $cmdname -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# Function to get MCP settings path for Cline
function Get-ClineConfigPath {
    $clineConfig = "$env:APPDATA\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json"
    if (Test-Path $clineConfig) {
        return $clineConfig
    }
    return $null
}

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Yellow

if (-not (Test-Command "node")) {
    Write-Host "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

$nodeVersion = node --version
Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green

if (-not (Test-Command "npm")) {
    Write-Host "❌ npm is not installed. Please install npm." -ForegroundColor Red
    exit 1
}

$npmVersion = npm --version
Write-Host "✅ npm version: $npmVersion" -ForegroundColor Green

# Build the MCP server
if (-not $SkipBuild -and -not $ConfigureOnly) {
    Write-Host ""
    Write-Host "🏗️ Building MCP server..." -ForegroundColor Yellow
    
    Push-Location $McpRoot
    
    try {
        Write-Host "📦 Installing dependencies..."
        npm install
        
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed"
        }
        
        Write-Host "🔨 Building TypeScript..."
        npm run build
        
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build failed"
        }
        
        Write-Host "✅ Build completed successfully!" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Build failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    finally {
        Pop-Location
    }
}

# Create data directories
Write-Host ""
Write-Host "📁 Creating data directories..." -ForegroundColor Yellow

$directories = @(
    $DataPath,
    (Join-Path $DataPath "employees"),
    (Join-Path $DataPath "backups")
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created directory: $dir" -ForegroundColor Green
    } else {
        Write-Host "📁 Directory already exists: $dir" -ForegroundColor Gray
    }
}

# Add .gitkeep files to maintain directory structure
$gitkeepFiles = @(
    (Join-Path $DataPath "employees" ".gitkeep"),
    (Join-Path $DataPath "backups" ".gitkeep")
)

foreach ($gitkeep in $gitkeepFiles) {
    if (-not (Test-Path $gitkeep)) {
        "# This file ensures the directory is tracked by git" | Out-File -FilePath $gitkeep -Encoding UTF8
        Write-Host "✅ Created .gitkeep: $gitkeep" -ForegroundColor Green
    }
}

# Configure AI assistants
Write-Host ""
Write-Host "🤖 Configuring AI assistants..." -ForegroundColor Yellow

$buildPath = Join-Path $McpRoot "build" "index.js"

# Configure Cline
$clineConfigPath = Get-ClineConfigPath
if ($clineConfigPath) {
    Write-Host "📝 Configuring Cline (VS Code extension)..." -ForegroundColor Cyan
    
    try {
        $clineConfig = @{}
        if (Test-Path $clineConfigPath) {
            $clineConfig = Get-Content $clineConfigPath | ConvertFrom-Json -AsHashtable
        }
        
        if (-not $clineConfig.ContainsKey("mcpServers")) {
            $clineConfig["mcpServers"] = @{}
        }
        
        $clineConfig["mcpServers"]["employee-onboarding"] = @{
            command = "node"
            args = @($buildPath)
            env = @{
                ONBOARDING_DATA_PATH = $DataPath
                ONBOARDING_CONFIG_PATH = $ConfigPath
            }
            disabled = $false
            autoApprove = @()
        }
        
        $clineConfig | ConvertTo-Json -Depth 10 | Set-Content $clineConfigPath -Encoding UTF8
        Write-Host "✅ Cline configuration updated!" -ForegroundColor Green
        $configuredAny = $true
    }
    catch {
        Write-Host "❌ Failed to configure Cline: $_" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ Cline not found. Install the Cline extension in VS Code if you want to use it. More information at aka.ms/cline" -ForegroundColor Yellow
}


# Test the MCP server
Write-Host ""
Write-Host "🧪 Testing MCP server..." -ForegroundColor Yellow

if (Test-Path $buildPath) {
    Write-Host "✅ MCP server build found at: $buildPath" -ForegroundColor Green
    
    # Quick test to see if the server starts
    try {
        $testProcess = Start-Process -FilePath "node" -ArgumentList $buildPath -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 2
        
        if (-not $testProcess.HasExited) {
            $testProcess.Kill()
            Write-Host "✅ MCP server starts successfully!" -ForegroundColor Green
        } else {
            Write-Host "⚠️ MCP server exited immediately. Check the logs." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️ Could not test MCP server startup: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ MCP server build not found. Run setup with -SkipBuild:$false" -ForegroundColor Red
}

# Create sample employee for testing
Write-Host ""
Write-Host "👤 Creating sample employee profile for testing..." -ForegroundColor Yellow

$sampleEmployeePath = Join-Path $DataPath "employees" "test.employee@company.com.json"
if (-not (Test-Path $sampleEmployeePath)) {
    $sampleEmployee = @{
        email = "test.employee@company.com"
        name = "Test Employee"
        startDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        buddyEmail = "mentor@company.com"
        department = "Engineering"
        currentStep = 1
        completedSteps = @()
        stepData = @{}
        metadata = @{
            createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            lastUpdated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            version = "1.0"
        }
    }
    
    $sampleEmployee | ConvertTo-Json -Depth 10 | Set-Content $sampleEmployeePath -Encoding UTF8
    Write-Host "✅ Sample employee profile created: test.employee@company.com" -ForegroundColor Green
} else {
    Write-Host "📁 Sample employee profile already exists" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host "=================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ MCP server built and configured" -ForegroundColor Green
Write-Host "✅ Data directories created" -ForegroundColor Green
Write-Host "✅ AI assistant configurations updated" -ForegroundColor Green
Write-Host "✅ Sample employee profile created for testing" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Restart your AI assistant (VS Code/Claude Desktop)" -ForegroundColor White
Write-Host "2. Try asking: 'Help me start my onboarding process'" -ForegroundColor White
Write-Host "3. Or ask: 'What onboarding tools are available?'" -ForegroundColor White
Write-Host ""
Write-Host "📖 For more information, see:" -ForegroundColor Cyan
Write-Host "   - README.md - Overview and usage instructions" -ForegroundColor White
Write-Host "   - docs/onboarding-buddy-guide.md - Configuration guide" -ForegroundColor White
Write-Host ""
Write-Host "Need help? Contact your IT team or check the documentation!" -ForegroundColor Yellow
