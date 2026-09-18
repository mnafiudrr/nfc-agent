<#
.SYNOPSIS
    Builds the Windows x64 executable for the ACR122U Local Agent.

.DESCRIPTION
    Runs the full pipeline described in docs/plans/windows-exe.md:
      npm ci  ->  verify the native pcsclite addon  ->  tsc  ->  @yao-pkg/pkg
      ->  patch the PE subsystem so the exe runs with no console window

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
    Default: dist\bin\win-x64\acr122u-agent-v<version>.exe, where <version> is
    the "version" field of package.json.

.PARAMETER NoStableCopy
    Do not also write the unversioned dist\bin\win-x64\acr122u-agent.exe copy.

.PARAMETER KeepVersions
    How many versioned executables to keep in the output folder (default 1, i.e.
    only the one just built). Older ones are deleted after a successful build.
    0 disables pruning.

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
    # Empty = derive dist\bin\win-x64\acr122u-agent-v<version>.exe from
    # package.json once the repo root is known. A param default cannot do it:
    # defaults bind before the Set-Location $RepoRoot further down.
    [string]$Output = '',
    [switch]$NoStableCopy,
    [int]$KeepVersions = 1,
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

# Flip the PE "Subsystem" field from 3 (CUI/console) to 2 (GUI/windows) so the
# Windows loader never allocates a console for the agent. Without this the exe
# opens a terminal whose close button kills the agent - see
# docs/plans/windows-tray.md section 4.1.
#
# Layout: DOS header e_lfanew at 0x3C -> PE signature (4) -> COFF header (20)
# -> optional header, where Subsystem sits at offset 68 in both PE32 and PE32+.
function Set-PeSubsystemGui {
    param([Parameter(Mandatory)][string]$Path)

    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $bytes = [System.IO.File]::ReadAllBytes($resolved)

    if ($bytes.Length -lt 0x40) { Fail "$Path is too small to be a PE image." }

    $peOff = [BitConverter]::ToInt32($bytes, 0x3C)
    if ($peOff -le 0 -or ($peOff + 92) -ge $bytes.Length) {
        Fail "$Path has an out-of-range PE header offset (e_lfanew = $peOff)."
    }
    if ([BitConverter]::ToUInt32($bytes, $peOff) -ne 0x00004550) {
        Fail "$Path is not a PE image (missing PE signature at 0x$($peOff.ToString('X')))."
    }

    $subOff = $peOff + 92
    $current = [BitConverter]::ToUInt16($bytes, $subOff)

    if ($current -eq 2) {
        Write-Ok 'Already GUI subsystem - no console window.'
        return
    }
    if ($current -ne 3) {
        # Anything else means the layout assumption is wrong; patching blind
        # would corrupt the exe.
        Fail "Unexpected PE subsystem value $current in $Path (expected 3 = console)." @(
            'The pkg base binary layout may have changed. Verify before patching.'
        )
    }

    $bytes[$subOff] = 2
    $bytes[$subOff + 1] = 0
    [System.IO.File]::WriteAllBytes($resolved, $bytes)

    $verify = [BitConverter]::ToUInt16([System.IO.File]::ReadAllBytes($resolved), $subOff)
    if ($verify -ne 2) { Fail "Failed to set the GUI subsystem on $Path." }

    Write-Ok "Subsystem 3 -> 2 at offset 0x$($subOff.ToString('X')) - the exe runs with no console."
}

# Reads the "version" field out of package.json.
#
# NOTE: under Set-StrictMode -Version Latest, $json.version THROWS when the
# property is absent. Indexing PSObject.Properties returns $null instead, which
# is what lets this fail with a useful message rather than a stack trace.
function Get-PackageVersion {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { Fail "package.json not found at $Path" }

    try {
        $json = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        Fail "Could not parse $Path as JSON: $($_.Exception.Message)"
    }

    $prop = $json.PSObject.Properties['version']
    if (-not $prop) { Fail "$Path has no ""version"" field." }

    $value = [string]$prop.Value
    if ($value -notmatch '^\d+\.\d+\.\d+([-+][0-9A-Za-z.\-+]+)?$') {
        Fail "package.json version '$value' is not a semver triple." @('Bump it with: npm run bump')
    }
    return $value
}

# The version in the exe's filename and the VERSION constant compiled into it
# must agree. An exe named v0.1.2 that reports v0.1.1 is worse than no version
# at all, so this fails the build rather than warning.
function Assert-VersionInSync {
    param(
        [Parameter(Mandatory)][string]$RepoRootPath,
        [Parameter(Mandatory)][string]$Version
    )

    $file = Join-Path $RepoRootPath 'src\version.ts'
    if (-not (Test-Path -LiteralPath $file)) {
        Fail 'src\version.ts is missing.' @('Generate it with: node scripts\write-version.mjs')
    }

    $match = [regex]::Match((Get-Content -LiteralPath $file -Raw), "VERSION\s*=\s*'([^']+)'")
    if (-not $match.Success) { Fail 'Could not find the VERSION constant in src\version.ts.' }

    if ($match.Groups[1].Value -ne $Version) {
        Fail "src\version.ts says $($match.Groups[1].Value) but package.json says $Version." @(
            'Re-sync them with: node scripts\write-version.mjs',
            'Bump both with:    npm run bump'
        )
    }
}

# --- 0. context ------------------------------------------------------------

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# Resolved here, before the slow steps, so a stale src\version.ts fails in
# seconds rather than after npm ci and pkg have run.
$Version = Get-PackageVersion (Join-Path $RepoRoot 'package.json')
Assert-VersionInSync -RepoRootPath $RepoRoot -Version $Version

if ([string]::IsNullOrWhiteSpace($Output)) {
    $Output = Join-Path 'dist\bin\win-x64' "acr122u-agent-v$Version.exe"
}

Write-Host "ACR122U Local Agent - Windows x64 build" -ForegroundColor White
Write-Host "Repo: $RepoRoot" -ForegroundColor DarkGray
Write-Host "Version: $Version" -ForegroundColor DarkGray

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

    # $runtimeRoot stays unversioned: it is scratch staging, wiped on every run.
    # Only the distributable zip carries the version.
    $zip = "dist-runtime\acr122u-agent-win-x64-v$Version.zip"
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path "$runtimeRoot\*" -DestinationPath $zip

    if ($KeepVersions -gt 0) {
        $staleZips = @(
            Get-ChildItem -LiteralPath 'dist-runtime' -Filter 'acr122u-agent-win-x64-v*.zip' -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -ine ([IO.Path]::GetFileName($zip)) } |
                Sort-Object LastWriteTime -Descending |
                Select-Object -Skip ([Math]::Max(0, $KeepVersions - 1))
        )
        foreach ($old in $staleZips) {
            Remove-Item -LiteralPath $old.FullName -Force -ErrorAction SilentlyContinue
            Write-Ok "Pruned $($old.Name)"
        }
    }

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

# --- 5c. make the exe windowless ------------------------------------------

Write-Step 'Switching the executable to the Windows GUI subsystem'

# Safe here because this flips two bytes in the PE header without moving any
# section, so pkg's appended payload stays at the offset pkg recorded. Editing
# PE *resources* - to set a custom icon, say - does move sections and silently
# breaks the exe; see docs/plans/windows-tray.md.
Set-PeSubsystemGui -Path $Output

# --- 5d. stable-name copy -------------------------------------------------

$stablePath = $null
$stableFailed = $false

if (-not $NoStableCopy -and ([IO.Path]::GetFileName($Output) -ine 'acr122u-agent.exe')) {
    Write-Step 'Refreshing the stable-name copy'

    $stablePath = Join-Path (Split-Path -Parent $Output) 'acr122u-agent.exe'
    try {
        # Copied after the subsystem patch, so the copy is already GUI-subsystem
        # and byte-identical - no second patch, no second verification.
        Copy-Item -LiteralPath $Output -Destination $stablePath -Force
        Write-Ok "$stablePath (byte-identical copy)"
    }
    catch {
        # Expected whenever the agent is sitting in the tray from a previous
        # build. The versioned exe is the real output, so warn and carry on.
        $stableFailed = $true
        Write-Warn2 "Could not refresh ${stablePath}: $($_.Exception.Message)"
        Write-Warn2 'It is most likely still running - quit it from the tray icon and re-run.'
        Write-Warn2 'The versioned executable built fine and is unaffected.'
    }
}

# --- 6. smoke test ---------------------------------------------------------

if (-not $NoSmokeTest) {
    Write-Step 'Smoke testing the executable (6 seconds)'

    # The exe is now a GUI-subsystem app with no stdout to capture, so the
    # smoke test drives it through LOG_FILE - which also exercises the file
    # sink end to end.
    $smokeLog = Join-Path $env:TEMP "acr122u-agent-smoke-$PID.log"
    if (Test-Path $smokeLog) { Remove-Item -Force $smokeLog }

    $prevLogFile = $env:LOG_FILE
    $env:LOG_FILE = $smokeLog
    try {
        $proc = Start-Process -FilePath (Resolve-Path $Output) -PassThru
    }
    finally {
        if ($null -eq $prevLogFile) { Remove-Item Env:\LOG_FILE -ErrorAction SilentlyContinue }
        else { $env:LOG_FILE = $prevLogFile }
    }

    Start-Sleep -Seconds 6

    if ($proc.MainWindowHandle -ne 0) {
        Write-Warn2 "The exe opened a window (handle $($proc.MainWindowHandle)) - the subsystem patch did not take effect."
    }
    else {
        Write-Ok 'No console window was created.'
    }

    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500

    $out = @()
    if (Test-Path $smokeLog) { $out = @(Get-Content $smokeLog -ErrorAction SilentlyContinue) }
    Remove-Item -Force $smokeLog -ErrorAction SilentlyContinue

    if ($out.Count -gt 0) {
        Write-Host '    --- agent.log ---' -ForegroundColor DarkGray
        $out | Select-Object -First 20 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    }

    $joined = $out -join "`n"
    if ($joined -match 'Agent started') {
        Write-Ok 'Executable starts and logs "Agent started" to the log file.'
    }
    elseif ($joined -match 'did not self-register|not a valid Win32 application|dlopen') {
        Write-Warn2 'The native addon failed to load - ABI or architecture mismatch.'
        Write-Warn2 "Rebuild with the Node major that matches the pkg target ($Target), or re-run with -Fallback."
    }
    elseif ($joined -match 'EADDRINUSE') {
        Write-Warn2 'Port 8765 is already in use - another agent instance is probably running. The exe itself is fine.'
    }
    elseif ($joined -match 'Agent already running') {
        Write-Warn2 'Another agent instance is already running. The exe itself is fine.'
    }
    else {
        Write-Warn2 'No "Agent started" line captured. Run the exe manually with LOG_FILE set to check.'
    }
}

# --- 6b. prune older versioned executables --------------------------------

# Runs only after the build and smoke test have succeeded, so a failed build
# never deletes the last exe that worked.
if ($KeepVersions -gt 0 -and $outDir -and (Test-Path -LiteralPath $outDir)) {
    $currentName = [IO.Path]::GetFileName($Output)
    # The -v glob means the stable acr122u-agent.exe is never a candidate.
    # @() matters: a single result is a scalar and .Count throws under StrictMode.
    $stale = @(
        Get-ChildItem -LiteralPath $outDir -Filter 'acr122u-agent-v*.exe' -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ine $currentName } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip ([Math]::Max(0, $KeepVersions - 1))
    )
    if ($stale.Count -gt 0) {
        Write-Step "Pruning older executables (keeping $KeepVersions)"
        foreach ($old in $stale) {
            Remove-Item -LiteralPath $old.FullName -Force -ErrorAction SilentlyContinue
            if (Test-Path -LiteralPath $old.FullName) {
                Write-Warn2 "$($old.Name) is in use and was not deleted."
            }
            else {
                Write-Ok "Pruned $($old.Name)"
            }
        }
    }
}

# --- 7. done ---------------------------------------------------------------

Write-Host "`nDone: $Output" -ForegroundColor Green
if ($stablePath -and -not $stableFailed) {
    Write-Host "Also: $stablePath" -ForegroundColor Green
    Write-Host 'Distribute and run the stable name. A changing filename makes Windows treat the' -ForegroundColor DarkGray
    Write-Host 'tray icon as a new app and re-pin it, losing a deliberate unpin (see src\tray\promote.ts).' -ForegroundColor DarkGray
}
elseif ($stableFailed) {
    Write-Host "NOT refreshed: $stablePath (still running)" -ForegroundColor Yellow
}
Write-Host 'Next: install the ACS ACR122U driver on the target machine, run the exe, tap a card.' -ForegroundColor DarkGray
Write-Host 'Full checklist: docs\tasks\007-manual-hardware-testing.md' -ForegroundColor DarkGray
