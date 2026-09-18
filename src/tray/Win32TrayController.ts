import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import type { Logger } from '../logger.js';
import { promoteTrayIcon } from './promote.js';
import { isReaderConnected, tooltip } from './status.js';
import type { TrayController, TrayIcons, TrayOptions, TrayStatus } from './types.js';
import {
  IMAGE_ICON,
  LR_LOADFROMFILE,
  MF_GRAYED,
  MF_SEPARATOR,
  MF_STRING,
  NIF_ICON,
  NIF_INFO,
  NIF_MESSAGE,
  NIF_TIP,
  NIM_ADD,
  NIM_DELETE,
  NIM_MODIFY,
  NIIF_INFO,
  PM_REMOVE,
  SM_CXSMICON,
  SM_CYSMICON,
  TPM_NONOTIFY,
  TPM_RETURNCMD,
  TPM_RIGHTBUTTON,
  WM_APP,
  WM_CONTEXTMENU,
  WM_LBUTTONUP,
  WM_RBUTTONUP,
  loadWin32,
  wchars,
  wstr,
  type Win32Api,
} from './win32.js';

const CLASS_NAME = 'Acr122uAgentTrayWindow';
const WINDOW_NAME = 'acr122u-agent';
const TRAY_ICON_ID = 1;
const TRAY_CALLBACK_MESSAGE = WM_APP + 1;
const PUMP_INTERVAL_MS = 50;
const TOOLTIP_UNITS = 128;
const INFO_UNITS = 256;
const INFO_TITLE_UNITS = 64;

const ID_STATUS = 1;
const ID_OPEN_LOGS = 2;
const ID_COPY_URL = 3;
const ID_QUIT = 4;

export class Win32TrayController implements TrayController {
  private readonly log: Logger;
  private readonly options: TrayOptions;
  private readonly icons: TrayIcons;

  // Held as fields so the GC cannot collect buffers Win32 still points at.
  private readonly classNameBuf = wstr(CLASS_NAME);
  private readonly windowNameBuf = wstr(WINDOW_NAME);

  private api: Win32Api | null = null;
  private wndProc: bigint | null = null;
  private hwnd: unknown = null;
  private hIcon: unknown = null;
  private baseIcon: unknown = null;
  private connectedIcon: unknown = null;
  private disconnectedIcon: unknown = null;
  private readonly loadedIcons: unknown[] = [];
  private classRegistered = false;
  private pump: NodeJS.Timeout | null = null;
  private taskbarCreatedMessage = 0;
  private menuRequested = false;
  private menuOpen = false;
  private iconAdded = false;
  private status: TrayStatus = { state: 'STARTING', reader: null };

  constructor(options: TrayOptions, log: Logger, icons: TrayIcons) {
    this.options = options;
    this.log = log;
    this.icons = icons;
  }

  start(): void {
    try {
      this.api = loadWin32();
      this.createWindow();
      this.loadIcon();
      this.addIcon();
      this.pump = setInterval(() => this.drain(), PUMP_INTERVAL_MS);
      this.pump.unref();
      this.log.info('Tray icon started');
      void this.pinToTaskbar();
    } catch (err) {
      // A missing tray must never stop the agent from reading cards.
      this.log.warn(`Tray icon unavailable, running without one: ${String(err)}`);
      this.stop();
    }
  }

  setStatus(status: TrayStatus): void {
    const wasConnected = isReaderConnected(this.status);
    this.status = status;
    if (!this.iconAdded || !this.api) {
      return;
    }

    const nowConnected = isReaderConnected(status);
    let flags = NIF_TIP;
    if (nowConnected !== wasConnected) {
      this.hIcon = this.iconForStatus();
      flags |= NIF_ICON;
    }

    try {
      this.api.Shell_NotifyIconW(NIM_MODIFY, this.buildIconData(flags));
    } catch (err) {
      this.log.debug(`Tray status update failed: ${String(err)}`);
    }
  }

  notify(title: string, message: string): void {
    const api = this.api;
    if (!this.iconAdded || !api) {
      return;
    }
    try {
      const data = this.buildIconData(NIF_INFO) as Record<string, unknown>;
      data['szInfo'] = wchars(message, INFO_UNITS);
      data['szInfoTitle'] = wchars(title, INFO_TITLE_UNITS);
      data['dwInfoFlags'] = NIIF_INFO;
      api.Shell_NotifyIconW(NIM_MODIFY, data);
    } catch (err) {
      this.log.debug(`Tray notification failed: ${String(err)}`);
    }
  }

  stop(): void {
    if (this.pump) {
      clearInterval(this.pump);
      this.pump = null;
    }
    this.removeIcon();
    const api = this.api;
    if (!api) {
      return;
    }
    try {
      for (const icon of this.loadedIcons) {
        api.DestroyIcon(icon);
      }
      this.loadedIcons.length = 0;
      this.hIcon = null;
      this.baseIcon = null;
      this.connectedIcon = null;
      this.disconnectedIcon = null;
      if (this.hwnd) {
        api.DestroyWindow(this.hwnd);
        this.hwnd = null;
      }
      if (this.classRegistered) {
        api.UnregisterClassW(this.classNameBuf, api.GetModuleHandleW(null));
        this.classRegistered = false;
      }
      if (this.wndProc !== null) {
        api.unregister(this.wndProc);
        this.wndProc = null;
      }
    } catch (err) {
      this.log.debug(`Tray teardown error: ${String(err)}`);
    }
  }

  // --- window ------------------------------------------------------------

  private createWindow(): void {
    const api = this.requireApi();
    const hInstance = api.GetModuleHandleW(null);

    this.wndProc = api.register(
      (hwnd: unknown, msg: number, wp: number, lp: number) => this.onMessage(hwnd, msg, wp, lp),
      api.wndProcPointer,
    );

    const atom = api.RegisterClassExW({
      cbSize: api.sizeofWndClass,
      style: 0,
      lpfnWndProc: this.wndProc,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance,
      hIcon: null,
      hCursor: null,
      hbrBackground: null,
      lpszMenuName: null,
      lpszClassName: this.classNameBuf,
      hIconSm: null,
    });
    if (!atom) {
      throw new Error('RegisterClassExW failed');
    }
    this.classRegistered = true;

    // A message-only window: never shown, only receives the tray callbacks.
    this.hwnd = api.CreateWindowExW(
      0,
      this.classNameBuf,
      this.windowNameBuf,
      0,
      0,
      0,
      0,
      0,
      api.hwndMessage,
      null,
      hInstance,
      null,
    );
    if (!this.hwnd) {
      throw new Error('CreateWindowExW failed');
    }

    this.taskbarCreatedMessage = Number(api.RegisterWindowMessageW(wstr('TaskbarCreated')));
  }

  private onMessage(hwnd: unknown, msg: number, wp: number, lp: number): number {
    const api = this.api;
    if (!api) {
      return 0;
    }
    if (msg === TRAY_CALLBACK_MESSAGE) {
      const event = Number(lp);
      if (event === WM_RBUTTONUP || event === WM_CONTEXTMENU || event === WM_LBUTTONUP) {
        // Defer: TrackPopupMenu runs its own modal loop, which must not be
        // entered from inside a dispatch we are already nested in.
        this.menuRequested = true;
      }
      return 0;
    }
    if (this.taskbarCreatedMessage !== 0 && msg === this.taskbarCreatedMessage) {
      // Explorer restarted and dropped every tray icon; put ours back.
      this.iconAdded = false;
      this.addIcon();
      return 0;
    }
    return Number(api.DefWindowProcW(hwnd, msg, wp, lp));
  }

  private drain(): void {
    const api = this.api;
    if (!api) {
      return;
    }
    try {
      const msg: Record<string, unknown> = {};
      while (api.PeekMessageW(msg, null, 0, 0, PM_REMOVE)) {
        api.TranslateMessage(msg);
        api.DispatchMessageW(msg);
      }
      if (this.menuRequested && !this.menuOpen) {
        this.menuRequested = false;
        this.showMenu();
      }
    } catch (err) {
      this.log.debug(`Tray message pump error: ${String(err)}`);
    }
  }

  // --- icon --------------------------------------------------------------

  private loadIconFile(path: string | null): unknown {
    if (!path) {
      return null;
    }
    const api = this.requireApi();
    const cx = Number(api.GetSystemMetrics(SM_CXSMICON)) || 16;
    const cy = Number(api.GetSystemMetrics(SM_CYSMICON)) || 16;
    const handle = api.LoadImageW(null, wstr(path), IMAGE_ICON, cx, cy, LR_LOADFROMFILE);
    if (!handle) {
      this.log.warn(`Could not load the tray icon from ${path}.`);
      return null;
    }
    this.loadedIcons.push(handle);
    return handle;
  }

  private loadIcon(): void {
    const api = this.requireApi();
    this.connectedIcon = this.loadIconFile(this.icons.connected);
    this.disconnectedIcon = this.loadIconFile(this.icons.disconnected);
    this.baseIcon = this.loadIconFile(this.icons.base);

    if (!this.connectedIcon && !this.disconnectedIcon && !this.baseIcon) {
      // Nothing usable on disk: fall back to the stock Windows application
      // icon so there is still something in the tray.
      this.baseIcon = api.LoadIconW(null, api.idiApplication);
    }
    this.hIcon = this.iconForStatus();
  }

  /** Badged variant when available, otherwise the plain brand icon. */
  private iconForStatus(): unknown {
    const wanted = isReaderConnected(this.status) ? this.connectedIcon : this.disconnectedIcon;
    return wanted ?? this.baseIcon;
  }

  private buildIconData(flags: number): unknown {
    const api = this.requireApi();
    return {
      cbSize: api.sizeofNotifyIconData,
      hWnd: this.hwnd,
      uID: TRAY_ICON_ID,
      uFlags: flags,
      uCallbackMessage: TRAY_CALLBACK_MESSAGE,
      hIcon: this.hIcon,
      szTip: wchars(tooltip(this.status), TOOLTIP_UNITS),
      dwState: 0,
      dwStateMask: 0,
      szInfo: wchars('', 256),
      uVersion: 0,
      szInfoTitle: wchars('', 64),
      dwInfoFlags: 0,
      guidItem: new Array<number>(16).fill(0),
      hBalloonIcon: null,
    };
  }

  private addIcon(): void {
    const api = this.api;
    if (this.iconAdded || !this.hwnd || !api) {
      return;
    }
    const data = this.buildIconData(NIF_MESSAGE | NIF_ICON | NIF_TIP);
    if (api.Shell_NotifyIconW(NIM_ADD, data)) {
      this.iconAdded = true;
    } else {
      this.log.warn('Shell_NotifyIcon(NIM_ADD) failed; no tray icon will be shown.');
    }
  }

  private removeIcon(): void {
    const api = this.api;
    if (!this.iconAdded || !this.hwnd || !api) {
      return;
    }
    try {
      api.Shell_NotifyIconW(NIM_DELETE, this.buildIconData(0));
    } catch (err) {
      this.log.debug(`Tray icon removal failed: ${String(err)}`);
    }
    this.iconAdded = false;
  }

  // --- menu --------------------------------------------------------------

  private showMenu(): void {
    const api = this.requireApi();
    let menu: unknown = null;
    this.menuOpen = true;
    try {
      menu = api.CreatePopupMenu();
      if (!menu) {
        return;
      }

      const label = tooltip(this.status).replace(/\n/g, ' - ');
      api.AppendMenuW(menu, MF_STRING | MF_GRAYED, ID_STATUS, wstr(label));
      api.AppendMenuW(menu, MF_SEPARATOR, 0, null);
      if (this.options.logFile) {
        api.AppendMenuW(menu, MF_STRING, ID_OPEN_LOGS, wstr('Open log folder'));
      }
      api.AppendMenuW(menu, MF_STRING, ID_COPY_URL, wstr('Copy WebSocket URL'));
      api.AppendMenuW(menu, MF_SEPARATOR, 0, null);
      api.AppendMenuW(menu, MF_STRING, ID_QUIT, wstr('Quit'));

      const point: Record<string, number> = {};
      api.GetCursorPos(point);

      // Required so the menu dismisses when the user clicks elsewhere.
      api.SetForegroundWindow(this.hwnd);

      const choice = Number(
        api.TrackPopupMenu(
          menu,
          TPM_RIGHTBUTTON | TPM_NONOTIFY | TPM_RETURNCMD,
          point['x'] ?? 0,
          point['y'] ?? 0,
          0,
          this.hwnd,
          null,
        ),
      );

      api.PostMessageW(this.hwnd, 0, 0, 0);
      this.onMenuChoice(choice);
    } catch (err) {
      this.log.warn(`Tray menu failed: ${String(err)}`);
    } finally {
      this.menuOpen = false;
      if (menu) {
        try {
          api.DestroyMenu(menu);
        } catch {
          // Nothing useful to do if the menu handle is already gone.
        }
      }
    }
  }

  private onMenuChoice(choice: number): void {
    switch (choice) {
      case ID_OPEN_LOGS:
        this.openLogFolder();
        break;
      case ID_COPY_URL:
        this.copyToClipboard(this.options.wsUrl);
        break;
      case ID_QUIT:
        this.log.info('Quit selected from the tray menu');
        this.options.onQuit();
        break;
      default:
        break;
    }
  }

  private openLogFolder(): void {
    if (!this.options.logFile) {
      return;
    }
    try {
      const child = spawn('explorer.exe', [dirname(this.options.logFile)], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', (err) => this.log.debug(`Could not open the log folder: ${err.message}`));
      child.unref();
    } catch (err) {
      this.log.debug(`Could not open the log folder: ${String(err)}`);
    }
  }

  private copyToClipboard(text: string): void {
    try {
      const child = spawn('clip.exe', { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      child.on('error', (err) => this.log.debug(`Clipboard copy failed: ${err.message}`));
      child.stdin?.end(text, 'utf8');
    } catch (err) {
      this.log.debug(`Clipboard copy failed: ${String(err)}`);
    }
  }

  private async pinToTaskbar(): Promise<void> {
    const changed = await promoteTrayIcon(this.log);
    if (!changed || !this.iconAdded) {
      return;
    }
    // Explorer reads IsPromoted when the icon is registered, so re-register it
    // rather than making the user restart the agent to see the icon appear.
    try {
      this.removeIcon();
      this.addIcon();
    } catch (err) {
      this.log.debug(`Could not re-add the tray icon after pinning: ${String(err)}`);
    }
  }

  private requireApi(): Win32Api {
    if (!this.api) {
      throw new Error('Win32 API not loaded');
    }
    return this.api;
  }
}
