import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import type { Logger } from '../logger.js';
import { tooltip } from './status.js';
import type { TrayController, TrayOptions, TrayStatus } from './types.js';
import {
  IMAGE_ICON,
  LR_LOADFROMFILE,
  MF_GRAYED,
  MF_SEPARATOR,
  MF_STRING,
  NIF_ICON,
  NIF_MESSAGE,
  NIF_TIP,
  NIM_ADD,
  NIM_DELETE,
  NIM_MODIFY,
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

const ID_STATUS = 1;
const ID_OPEN_LOGS = 2;
const ID_COPY_URL = 3;
const ID_QUIT = 4;

export class Win32TrayController implements TrayController {
  private readonly log: Logger;
  private readonly options: TrayOptions;
  private readonly iconPath: string | null;

  // Held as fields so the GC cannot collect buffers Win32 still points at.
  private readonly classNameBuf = wstr(CLASS_NAME);
  private readonly windowNameBuf = wstr(WINDOW_NAME);

  private api: Win32Api | null = null;
  private wndProc: bigint | null = null;
  private hwnd: unknown = null;
  private hIcon: unknown = null;
  private ownsIcon = false;
  private classRegistered = false;
  private pump: NodeJS.Timeout | null = null;
  private taskbarCreatedMessage = 0;
  private menuRequested = false;
  private menuOpen = false;
  private iconAdded = false;
  private status: TrayStatus = { state: 'STARTING', reader: null };

  constructor(options: TrayOptions, log: Logger, iconPath: string | null) {
    this.options = options;
    this.log = log;
    this.iconPath = iconPath;
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
    } catch (err) {
      // A missing tray must never stop the agent from reading cards.
      this.log.warn(`Tray icon unavailable, running without one: ${String(err)}`);
      this.stop();
    }
  }

  setStatus(status: TrayStatus): void {
    this.status = status;
    if (!this.iconAdded || !this.api) {
      return;
    }
    try {
      this.api.Shell_NotifyIconW(NIM_MODIFY, this.buildIconData(NIF_TIP));
    } catch (err) {
      this.log.debug(`Tray tooltip update failed: ${String(err)}`);
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
      if (this.hIcon && this.ownsIcon) {
        api.DestroyIcon(this.hIcon);
      }
      this.hIcon = null;
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

  private loadIcon(): void {
    const api = this.requireApi();
    if (this.iconPath) {
      const cx = Number(api.GetSystemMetrics(SM_CXSMICON)) || 16;
      const cy = Number(api.GetSystemMetrics(SM_CYSMICON)) || 16;
      this.hIcon = api.LoadImageW(null, wstr(this.iconPath), IMAGE_ICON, cx, cy, LR_LOADFROMFILE);
      if (this.hIcon) {
        this.ownsIcon = true;
        return;
      }
      this.log.warn(`Could not load the tray icon from ${this.iconPath}; using the default icon.`);
    }
    this.hIcon = api.LoadIconW(null, api.idiApplication);
    this.ownsIcon = false;
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

  private requireApi(): Win32Api {
    if (!this.api) {
      throw new Error('Win32 API not loaded');
    }
    return this.api;
  }
}
