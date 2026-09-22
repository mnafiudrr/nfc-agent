/**
 * The product name shown to users: tray tooltip and menu, notifications, the
 * log window title, and the startup log line.
 *
 * Kept separate from the package/directory name `acr122u-agent`, which is an
 * identifier (npm package, %LOCALAPPDATA% folder, window class) and must not
 * change - renaming it would orphan existing logs and settings.
 *
 * The Windows executable reports this through its PE FileDescription, which is
 * what Task Manager shows; see Set-ExeFileDescription in
 * scripts/build-win-exe.ps1.
 */
export const APP_NAME = 'ASRI Living ACR122 Agent';
