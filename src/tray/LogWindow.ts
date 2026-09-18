import type { BufferedLogSink, Logger } from '../logger.js';
import {
  CW_USEDEFAULT,
  EM_REPLACESEL,
  EM_SCROLLCARET,
  EM_SETLIMITTEXT,
  EM_SETSEL,
  ES_AUTOHSCROLL,
  ES_AUTOVSCROLL,
  ES_MULTILINE,
  ES_READONLY,
  FIXED_PITCH_MODERN,
  SW_HIDE,
  SW_RESTORE,
  SW_SHOW,
  WM_CLOSE,
  WM_GETTEXTLENGTH,
  WM_SETFONT,
  WM_SIZE,
  WS_CHILD,
  WS_HSCROLL,
  WS_OVERLAPPEDWINDOW,
  WS_VISIBLE,
  WS_VSCROLL,
  wstr,
  type Win32Api,
} from './win32.js';

const CLASS_NAME = 'Acr122uAgentLogWindow';
const TITLE = 'ACR122U Agent - Log';
const WIDTH = 900;
const HEIGHT = 520;

// Appending forever would grow the edit control without bound, so the control
// is rebuilt from the (capped) buffer after this many appends.
const APPENDS_BEFORE_REFRESH = 400;

/**
 * A plain Win32 window holding a read-only multiline EDIT control that shows
 * the agent log as it happens.
 *
 * Closing it only hides it - the agent keeps running, which is the whole point
 * of living in the tray. It shares the tray's message pump, since both windows
 * belong to the same thread.
 */
export class LogWindow {
  private readonly api: Win32Api;
  private readonly log: Logger;
  private readonly buffer: BufferedLogSink;

  private readonly classNameBuf = wstr(CLASS_NAME);
  private readonly titleBuf = wstr(TITLE);
  private readonly editClassBuf = wstr('EDIT');

  private wndProc: bigint | null = null;
  private hwnd: unknown = null;
  private edit: unknown = null;
  private font: unknown = null;
  private classRegistered = false;
  private appendsSinceRefresh = 0;
  private destroyed = false;

  constructor(api: Win32Api, log: Logger, buffer: BufferedLogSink) {
    this.api = api;
    this.log = log;
    this.buffer = buffer;
  }

  /** Shows the window, creating it on first use. */
  show(): void {
    try {
      if (!this.hwnd) {
        this.create();
        this.refresh();
      }
      const api = this.api;
      api.ShowWindow(this.hwnd, SW_SHOW);
      api.ShowWindow(this.hwnd, SW_RESTORE);
      api.SetForegroundWindow(this.hwnd);
    } catch (err) {
      this.log.warn(`Could not open the log window: ${String(err)}`);
    }
  }

  hide(): void {
    if (this.hwnd) {
      this.api.ShowWindow(this.hwnd, SW_HIDE);
    }
  }

  isVisible(): boolean {
    return Boolean(this.hwnd) && Number(this.api.IsWindowVisible(this.hwnd)) !== 0;
  }

  toggle(): void {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy(): void {
    this.destroyed = true;
    const api = this.api;
    try {
      this.buffer.onLine(null);
      if (this.hwnd) {
        api.DestroyWindow(this.hwnd);
        this.hwnd = null;
        this.edit = null;
      }
      if (this.font) {
        api.DeleteObject(this.font);
        this.font = null;
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
      this.log.debug(`Log window teardown error: ${String(err)}`);
    }
  }

  private create(): void {
    const api = this.api;
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
      throw new Error('RegisterClassExW failed for the log window');
    }
    this.classRegistered = true;

    this.hwnd = api.CreateWindowExW(
      0,
      this.classNameBuf,
      this.titleBuf,
      WS_OVERLAPPEDWINDOW,
      CW_USEDEFAULT,
      CW_USEDEFAULT,
      WIDTH,
      HEIGHT,
      null,
      null,
      hInstance,
      null,
    );
    if (!this.hwnd) {
      throw new Error('CreateWindowExW failed for the log window');
    }

    this.edit = api.CreateWindowExW(
      0,
      this.editClassBuf,
      wstr(''),
      WS_CHILD |
        WS_VISIBLE |
        WS_VSCROLL |
        WS_HSCROLL |
        ES_MULTILINE |
        ES_READONLY |
        ES_AUTOVSCROLL |
        // Without ES_AUTOHSCROLL the horizontal scrollbar is inert and long
        // lines wrap instead of scrolling.
        ES_AUTOHSCROLL,
      0,
      0,
      WIDTH,
      HEIGHT,
      this.hwnd,
      null,
      hInstance,
      null,
    );
    if (!this.edit) {
      throw new Error('Could not create the log text control');
    }

    // 0 means "no limit"; without it the control silently stops accepting text.
    api.SendMessageW(this.edit, EM_SETLIMITTEXT, 0, 0);

    this.font = api.CreateFontW(
      -12,
      0,
      0,
      0,
      400,
      0,
      0,
      0,
      1 /* DEFAULT_CHARSET */,
      0,
      0,
      0,
      FIXED_PITCH_MODERN,
      wstr('Consolas'),
    );
    if (this.font) {
      api.SendMessageW(this.edit, WM_SETFONT, this.font, 1);
    }

    this.layout();
    this.buffer.onLine((line) => this.append(line));
  }

  private onMessage(hwnd: unknown, msg: number, wp: number, lp: number): number {
    const api = this.api;
    if (msg === WM_CLOSE) {
      // Hide, never destroy: closing the log must not stop the agent.
      api.ShowWindow(hwnd, SW_HIDE);
      return 0;
    }
    if (msg === WM_SIZE) {
      this.layout();
      return 0;
    }
    return Number(api.DefWindowProcW(hwnd, msg, wp, lp));
  }

  private layout(): void {
    if (!this.hwnd || !this.edit) {
      return;
    }
    const rect: Record<string, number> = {};
    this.api.GetClientRect(this.hwnd, rect);
    const width = (rect['right'] ?? WIDTH) - (rect['left'] ?? 0);
    const height = (rect['bottom'] ?? HEIGHT) - (rect['top'] ?? 0);
    this.api.MoveWindow(this.edit, 0, 0, width, height, 1);
  }

  /** Replaces the control's contents with the buffered history. */
  private refresh(): void {
    if (!this.edit) {
      return;
    }
    // The trailing newline matters: without it the next appended line is glued
    // onto the last buffered one.
    const lines = this.buffer.snapshot();
    const text = lines.length > 0 ? `${lines.join('\r\n')}\r\n` : '';
    this.api.SetWindowTextW(this.edit, wstr(text));
    this.appendsSinceRefresh = 0;
    this.scrollToEnd();
  }

  private append(line: string): void {
    if (this.destroyed || !this.edit) {
      return;
    }
    try {
      if (this.appendsSinceRefresh >= APPENDS_BEFORE_REFRESH) {
        this.refresh();
        return;
      }
      this.appendsSinceRefresh += 1;
      const api = this.api;
      // Collapse the selection at the very end, then insert there.
      // EM_SETSEL(-1, -1) does NOT move the caret to the end - it clears the
      // selection and leaves it at the start, which appends in reverse.
      const end = Number(api.SendMessageW(this.edit, WM_GETTEXTLENGTH, 0, 0));
      api.SendMessageW(this.edit, EM_SETSEL, end, end);
      api.SendMessageTextW(this.edit, EM_REPLACESEL, 0, wstr(`${line}\r\n`));
      this.scrollToEnd();
    } catch (err) {
      this.log.debug(`Could not append to the log window: ${String(err)}`);
    }
  }

  private scrollToEnd(): void {
    if (!this.edit) {
      return;
    }
    const end = Number(this.api.SendMessageW(this.edit, WM_GETTEXTLENGTH, 0, 0));
    this.api.SendMessageW(this.edit, EM_SETSEL, end, end);
    this.api.SendMessageW(this.edit, EM_SCROLLCARET, 0, 0);
  }
}
