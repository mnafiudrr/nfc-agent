<#
.SYNOPSIS
    Builds the Windows x64 executable for the ACR122U Local Agent.

.DESCRIPTION
    Runs the full pipeline described in docs/plans/windows-exe.md:
      npm ci  ->  verify the native pcsclite addon  ->  tsc  ->  @yao-pkg/pkg

    The pkg target is derived from the locally installed Node major version so
    the bundled runtime ABI always matches the pcsclite addon that npm ci just
    compiled. Must be run on Windows x64 - the native addon cannot be
    cross-compiled from macOS or Linux.

.PARAMETER SkipInstall
    Skip "npm ci". Use only when node_modules is already built by the same
    Node major version you are packaging for.

.PARAMETER Target
    Override the auto-detected pkg target, e.g. "node22-win-x64".

.PARAMETER Output
    Output path for the executable.
    Default: dist\bin\win-x64\acr122u-agent.exe

.PARAMETER Fallback
    Skip pkg entirely and produce the bundled-runtime distribution described in
    docs/plans/windows-exe.md section 8 (node.exe + app + run.bat in
    dist-runtime\win-x64\). Slower to copy, but immune to pkg/ABI issues.

.PARAMETER NoSmokeTest
    Do not launch the freshly built exe for a few seconds to check it starts.

.EXAMPLE
    npm run build:exe

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-win-exe.ps1 -Fallback
#>

[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [string]$Target,
    [string]$Output = 'dist\bin\win-x64\acr122u-agent.exe',
    [switch]$Fallback,
    [switch]$NoSmokeTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- helpers ---------------------------------------------------------------

function Write-Step { param([string]$Message) Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    OK  $Message" -ForegroundColor Green }
function Write-Warn2 { param([string]$Message) Write-Host "    !   $Message" -ForegroundColor Yellow }

function Fail {
    param([string]$Message, [string[]]$Hints = @())
    Write-Host "`nBUILD FAILED: $Message" -ForegroundColor Red
    foreach ($h in $Hints) { Write-Host "  - $h" -ForegroundColor Yellow }
    exit 1
}

# NOTE: the argument array parameter must NOT be called $Args - that is a
# PowerShell automatic variable and binding to it silently yields an empty array.
function Invoke-Checked {
    param([string]$Label, [string]$Exe, [string[]]$Arguments, [string[]]$Hints = @())
    Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { Fail "$Label failed (exit code $LASTEXITCODE)." $Hints }
}

# Locate a usable Python 3 for node-gyp.
# Two Windows traps this works around:
#   1. The Microsoft Store "app execution alias" at
#      %LOCALAPPDATA%\Microsoft\WindowsApps\python.exe is a 0-byte stub. It is
#      on PATH by default, runs, prints nothing and exits - which is why
#      node-gyp reports  version is ""  /  could not be run.
#   2. node-gyp's built-in location list only probes Python 3.11 and older, so a
#      3.12+ install in the default folder is never discovered.
function Get-Python3 {
    $ErrorActionPreference = 'Continue'   # function-local; native stderr must not throw

    $candidates = New-Object System.Collections.Generic.List[string]

    if ($env:PYTHON) { $candidates.Add($env:PYTHON) }

    foreach ($name in @('python3', 'python')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source) { $candidates.Add($cmd.Source) }
    }

    # The py launcher knows where every registered interpreter lives.
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $viaPy = & py -3 -c "import sys; print(sys.executable)" 2>$null | Select-Object -First 1
        if ($viaPy) { $candidates.Add($viaPy.Trim()) }
    }

    $globs = @(
        "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe",
        "$env:ProgramFiles\Python3*\python.exe",
        "${env:ProgramFiles(x86)}\Python3*\python.exe",
        'C:\Python3*\python.exe'
    )
    foreach ($g in $globs) {
        Get-ChildItem $g -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            ForEach-Object { $candidates.Add($_.FullName) }
    }

    foreach ($c in $candidates) {
        if ([string]::IsNullOrWhiteSpace($c)) { continue }
        if (-not (Test-Path -LiteralPath $c)) { continue }
        if ((Get-Item -LiteralPath $c).Length -eq 0) { continue }   # Store alias stub
        $ver = & $c --version 2>$null | Select-Object -First 1
        if ($ver -match '^Python 3\.') { return [pscustomobject]@{ Path = $c; Version = $ver.Trim() } }
    }

    return $null
}

# --- 0. context ------------------------------------------------------------

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
Write-Host "ACR122U Local Agent - Windows x64 build" -ForegroundColor White
Write-Host "Repo: $RepoRoot" -ForegroundColor DarkGray

# --- 1. environment checks -------------------------------------------------

Write-Step 'Checking build environment'

if (-not [Environment]::Is64BitOperatingSystem) {
    Fail 'This script builds a 64-bit (x64/amd64) executable and must run on 64-bit Windows.'
}

$arch = $env:PROCESSOR_ARCHITECTURE
if ($arch -eq 'ARM64') {
    Write-Warn2 'Host is Windows on ARM. npm ci will compile an arm64 addon, which will not load in a win-x64 exe.'
    Write-Warn2 'Build on an x64 machine, or use an x64 Node install in an x64 shell.'
}

foreach ($tool in @('node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Fail "'$tool' was not found on PATH." @(
            'Install Node.js LTS from https://nodejs.org (the x64 Windows installer).',
            'Open a new terminal afterwards so PATH is refreshed.'
        )
    }
}

$nodeVersion = (& node -v).Trim()            # e.g. v22.11.0
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
Write-Ok "Node $nodeVersion (major $nodeMajor)"
Write-Ok "npm $((& npm -v).Trim())"

# node-gyp compiles the pcsclite addon during npm ci and needs Python 3 for that.
$python = Get-Python3
if ($python) {
    $env:PYTHON = $python.Path          # node-gyp reads this; beats its own stale search list
    Write-Ok "$($python.Version) at $($python.Path)"
}
elseif ($SkipInstall) {
    Write-Warn2 'No Python 3 found, but -SkipInstall means node-gyp will not run.'
}
else {
    Fail 'No usable Python 3 installation found (node-gyp needs one to compile the pcsclite addon).' @(
        'Install it with:  winget install --id Python.Python.3.12 -e --scope user',
        'or download it from https://www.python.org/downloads/windows/',
        'Note: the python.exe in %LOCALAPPDATA%\Microsoft\WindowsApps is a Microsoft Store',
        'placeholder stub, not an interpreter - having it on PATH does not count.'
    )
}

$supportedMajors = @(18, 20, 22, 24)
if ($Target) {
    Write-Ok "pkg target (explicit): $Target"
}
elseif ($supportedMajors -contains $nodeMajor) {
    $Target = "node$nodeMajor-win-x64"
    Write-Ok "pkg target (auto): $Target"
}
else {
    Fail "Node major $nodeMajor has no matching @yao-pkg/pkg base binary." @(
        "Supported majors: $($supportedMajors -join ', ').",
        'Install a supported Node LTS, or pass -Target node22-win-x64 and accept the ABI risk.'
    )
}

if (-not (Test-Path 'package.json')) {
    Fail "package.json not found in $RepoRoot - run this script from inside the repo."
}

# --- 2. install dependencies ----------------------------------------------

$addonDir = 'node_modules\@pokusew\pcsclite'
$addonPath = "$addonDir\build\Release\pcsclite.node"

if ($SkipInstall) {
    Write-Step 'Skipping npm ci (-SkipInstall)'
    if (-not (Test-Path 'node_modules')) { Fail 'node_modules is missing, so -SkipInstall cannot be used.' }
}
else {
    Write-Step 'Installing dependencies (npm ci)'
    Write-Host '    This compiles the native pcsclite addon with node-gyp and can take a few minutes.' -ForegroundColor DarkGray
    Invoke-Checked -Label 'npm ci' -Exe 'npm' -Arguments @('ci') -Hints @(
        'node-gyp needs Visual Studio Build Tools with the "Desktop development with C++" workload, plus Python 3.',
        'Install them from https://visualstudio.microsoft.com/visual-cpp-build-tools/ and re-run.',
        'If npm ci complains the lockfile is out of sync, run "npm install" once and commit the lockfile.'
    )
}

# --- 3. verify the native addon -------------------------------------------

Write-Step 'Verifying the native pcsclite addon'

if (-not (Test-Path $addonPath)) {
    Fail "Native addon not found at $addonPath" @(
        'node-gyp did not produce the addon. Scroll up in the npm ci output for the compiler error.',
        'Most common cause: Visual Studio Build Tools (C++ workload) or Python 3 is missing.',
        'Re-run with: npm ci --foreground-scripts   to see the full node-gyp log.'
    )
}
$addonSize = [math]::Round((Get-Item $addonPath).Length / 1KB, 1)
Write-Ok "$addonPath ($addonSize KB)"

# Confirm the addon actually loads in this Node before packaging it.
# NOTE: module_root must be ABSOLUTE. bindings feeds the joined path straight to
# require(), and require() treats a relative path without a leading ./ as a
# package name, so a relative root always fails to resolve.
# NOTE: $ErrorActionPreference is 'Stop' in this script, and in Windows
# PowerShell redirecting a native command's stderr (2>&1) wraps each line in a
# terminating NativeCommandError. Relax it so a noisy-but-successful load does
# not kill the build.
$addonRoot = (Resolve-Path $addonDir).Path
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& node -e "require('bindings')({bindings:'pcsclite',module_root:process.argv[1]});" $addonRoot 2>&1 | Out-Null
$addonLoadExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($addonLoadExit -ne 0) {
    Write-Warn2 'The addon did not load cleanly in this Node build - the exe is likely to fail the same way.'
    Write-Warn2 'Usual cause: node_modules was installed by a different Node major or a different CPU arch.'
    Write-Warn2 'Fix: rmdir /s /q node_modules  then re-run this script without -SkipInstall.'
}
else {
    Write-Ok "Addon loads under Node $nodeVersion"
}

# --- 4. compile TypeScript -------------------------------------------------

Write-Step 'Compiling TypeScript (npm run build)'
Invoke-Checked -Label 'tsc' -Exe 'npm' -Arguments @('run', 'build') `
    -Hints @('Fix the reported type errors, then re-run.')

if (-not (Test-Path 'dist\index.js')) { Fail 'tsc finished but dist\index.js is missing.' }
Write-Ok 'dist\index.js'

# --- 5a. fallback: bundled runtime ----------------------------------------

if ($Fallback) {
    Write-Step 'Building bundled-runtime distribution (-Fallback)'

    $runtimeRoot = 'dist-runtime\win-x64'
    if (Test-Path $runtimeRoot) { Remove-Item -Recurse -Force $runtimeRoot }
    New-Item -ItemType Directory -Force -Path "$runtimeRoot\app" | Out-Null

    Copy-Item -Recurse -Force 'dist' "$runtimeRoot\app\dist"
    Copy-Item -Recurse -Force 'node_modules' "$runtimeRoot\app\node_modules"
    Copy-Item -Force 'package.json' "$runtimeRoot\app\package.json"
    Copy-Item -Force (Get-Command node).Source "$runtimeRoot\node.exe"

    @'
@echo off
"%~dp0node.exe" "%~dp0app\dist\index.js" %*
'@ | Set-Content -Encoding ASCII "$runtimeRoot\run.bat"

    $zip = 'dist-runtime\acr122u-agent-win-x64.zip'
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path "$runtimeRoot\*" -DestinationPath $zip

    $zipSize = [math]::Round((Get-Item $zip).Length / 1MB, 1)
    Write-Ok "$runtimeRoot\run.bat"
    Write-Ok "$zip ($zipSize MB)"
    Write-Host "`nDone. Distribute the zip; the user unpacks it and runs run.bat." -ForegroundColor Green
    Write-Host 'The ACS ACR122U driver is still required on the target machine.' -ForegroundColor DarkGray
    exit 0
}

# --- 5b. package the executable -------------------------------------------

Write-Step "Packaging the executable with @yao-pkg/pkg ($Target)"

$outDir = Split-Path -Parent $Output
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
if (Test-Path $Output) { Remove-Item -Force $Output }

Write-Host '    The first run downloads the Node base binary for the target (needs internet).' -ForegroundColor DarkGray
Invoke-Checked -Label 'pkg' -Exe 'npx' `
    -Arguments @('--yes', '@yao-pkg/pkg', '.', '--targets', $Target, '--output', $Output) -Hints @(
    'If pkg rejects the ESM entrypoint, re-run with -Fallback to ship the bundled runtime instead.',
    'If the base binary download failed, check your proxy/firewall and re-run.'
)

if (-not (Test-Path $Output)) { Fail "pkg reported success but $Output does not exist." }

$exeSize = [math]::Round((Get-Item $Output).Length / 1MB, 1)
Write-Ok "$Output ($exeSize MB)"

# --- 6. smoke test ---------------------------------------------------------

if (-not $NoSmokeTest) {
    Write-Step 'Smoke testing the executable (6 seconds)'

    $logFile = Join-Path $env:TEMP "acr122u-agent-smoke-$PID.log"
    $proc = Start-Process -FilePath (Resolve-Path $Output) -PassThru -NoNewWindow `
        -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"

    Start-Sleep -Seconds 6
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500

    $out = @()
    foreach ($f in @($logFile, "$logFile.err")) {
        if (Test-Path $f) { $out += Get-Content $f -ErrorAction SilentlyContinue }
    }
    Remove-Item -Force $logFile, "$logFile.err" -ErrorAction SilentlyContinue

    if ($out.Count -gt 0) {
        Write-Host '    --- output ---' -ForegroundColor DarkGray
        $out | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }

    $joined = $out -join "`n"
    if ($joined -match 'Agent started') {
        Write-Ok 'Executable starts and logs "Agent started".'
    }
    elseif ($joined -match 'did not self-register|not a valid Win32 application|dlopen') {
        Write-Warn2 'The native addon failed to load - ABI or architecture mismatch.'
        Write-Warn2 "Rebuild with the Node major that matches the pkg target ($Target), or re-run with -Fallback."
    }
    elseif ($joined -match 'EADDRINUSE') {
        Write-Warn2 'Port 8765 is already in use - another agent instance is probably running. The exe itself is fine.'
    }
    else {
        Write-Warn2 'No "Agent started" line captured. Run the exe manually to check.'
    }
}

# --- 7. done ---------------------------------------------------------------

Write-Host "`nDone: $Output" -ForegroundColor Green
Write-Host 'Next: install the ACS ACR122U driver on the target machine, run the exe, tap a card.' -ForegroundColor DarkGray
Write-Host 'Full checklist: docs\tasks\007-manual-hardware-testing.md' -ForegroundColor DarkGray
