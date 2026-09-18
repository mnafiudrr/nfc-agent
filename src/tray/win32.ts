import koffi from 'koffi';

/**
 * Win32 bindings for the tray icon.
 *
 * Everything that touches a Windows DLL lives inside loadWin32(), which is
 * called only on win32. The module itself must stay importable on macOS,
 * because pkg cannot resolve a dynamic import() inside its ESM snapshot
 * (ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING), so the platform branch has to be a
 * runtime check around a static import rather than a lazy one.
 */

export const NIM_ADD = 0;
export const NIM_MODIFY = 1;
export const NIM_DELETE = 2;

export const NIF_MESSAGE = 0x01;
export const NIF_ICON = 0x02;
export const NIF_TIP = 0x04;

export const WM_APP = 0x8000;
export const WM_LBUTTONUP = 0x0202;
export const WM_RBUTTONUP = 0x0205;
export const WM_CONTEXTMENU = 0x007b;

export const MF_STRING = 0x0000;
export const MF_GRAYED = 0x0001;
export const MF_SEPARATOR = 0x0800;

export const TPM_RIGHTBUTTON = 0x0002;
export const TPM_NONOTIFY = 0x0080;
export const TPM_RETURNCMD = 0x0100;

export const IMAGE_ICON = 1;
export const LR_LOADFROMFILE = 0x0010;

export const PM_REMOVE = 1;

export const SM_CXSMICON = 49;
export const SM_CYSMICON = 50;

/** Null-terminated UTF-16 buffer for a `const wchar_t *` argument. */
export function wstr(value: string): Buffer {
  return Buffer.from(`${value}\0`, 'utf16le');
}

/** Fixed-length UTF-16 code-unit array for an inline `WCHAR[n]` struct field. */
export function wchars(value: string, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  const truncated = value.slice(0, length - 1);
  for (let i = 0; i < truncated.length; i += 1) {
    out[i] = truncated.charCodeAt(i);
  }
  return out;
}

type Fn = (...args: unknown[]) => unknown;

export interface Win32Api {
  sizeofWndClass: number;
  sizeofNotifyIconData: number;
  wndProcPointer: unknown;
  idiApplication: unknown;
  hwndMessage: unknown;

  // never[] params so any concrete callback signature is assignable here.
  register(callback: (...args: never[]) => unknown, type: unknown): bigint;
  unregister(callback: bigint): void;

  GetModuleHandleW: Fn;
  RegisterClassExW: Fn;
  UnregisterClassW: Fn;
  CreateWindowExW: Fn;
  DestroyWindow: Fn;
  DefWindowProcW: Fn;
  PeekMessageW: Fn;
  TranslateMessage: Fn;
  DispatchMessageW: Fn;
  RegisterWindowMessageW: Fn;
  PostMessageW: Fn;
  LoadImageW: Fn;
  LoadIconW: Fn;
  DestroyIcon: Fn;
  GetSystemMetrics: Fn;
  CreatePopupMenu: Fn;
  AppendMenuW: Fn;
  TrackPopupMenu: Fn;
  DestroyMenu: Fn;
  GetCursorPos: Fn;
  SetForegroundWindow: Fn;
  Shell_NotifyIconW: Fn;
}

let cached: Win32Api | null = null;

export function loadWin32(): Win32Api {
  if (cached) {
    return cached;
  }

  const POINT = koffi.struct('POINT', { x: 'long', y: 'long' });

  // Registered by name; the function signatures below refer to it as "MSG *".
  koffi.struct('MSG', {
    hwnd: 'void *',
    message: 'uint32_t',
    wParam: 'uintptr_t',
    lParam: 'intptr_t',
    time: 'uint32_t',
    pt: POINT,
  });

  const WNDCLASSEXW = koffi.struct('WNDCLASSEXW', {
    cbSize: 'uint32_t',
    style: 'uint32_t',
    lpfnWndProc: 'void *',
    cbClsExtra: 'int',
    cbWndExtra: 'int',
    hInstance: 'void *',
    hIcon: 'void *',
    hCursor: 'void *',
    hbrBackground: 'void *',
    lpszMenuName: 'void *',
    lpszClassName: 'void *',
    hIconSm: 'void *',
  });

  // Matches the documented x64 layout: sizeof == 976.
  const NOTIFYICONDATAW = koffi.struct('NOTIFYICONDATAW', {
    cbSize: 'uint32_t',
    hWnd: 'void *',
    uID: 'uint32_t',
    uFlags: 'uint32_t',
    uCallbackMessage: 'uint32_t',
    hIcon: 'void *',
    szTip: koffi.array('uint16_t', 128),
    dwState: 'uint32_t',
    dwStateMask: 'uint32_t',
    szInfo: koffi.array('uint16_t', 256),
    uVersion: 'uint32_t',
    szInfoTitle: koffi.array('uint16_t', 64),
    dwInfoFlags: 'uint32_t',
    guidItem: koffi.array('uint8_t', 16),
    hBalloonIcon: 'void *',
  });

  const WNDPROC = koffi.proto(
    'intptr_t __stdcall WndProc(void *hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)',
  );

  const user32 = koffi.load('user32.dll');
  const shell32 = koffi.load('shell32.dll');
  const kernel32 = koffi.load('kernel32.dll');

  cached = {
    sizeofWndClass: koffi.sizeof(WNDCLASSEXW),
    sizeofNotifyIconData: koffi.sizeof(NOTIFYICONDATAW),
    wndProcPointer: koffi.pointer(WNDPROC),
    idiApplication: koffi.as(32512, 'const uint16_t *'),
    hwndMessage: koffi.as(-3, 'void *'),

    register: koffi.register.bind(koffi) as Win32Api['register'],
    unregister: koffi.unregister.bind(koffi) as Win32Api['unregister'],

    GetModuleHandleW: kernel32.func('void *__stdcall GetModuleHandleW(const uint16_t *name)'),
    RegisterClassExW: user32.func('uint16_t __stdcall RegisterClassExW(const WNDCLASSEXW *cls)'),
    UnregisterClassW: user32.func(
      'int __stdcall UnregisterClassW(const uint16_t *cls, void *inst)',
    ),
    CreateWindowExW: user32.func(
      'void *__stdcall CreateWindowExW(uint32_t exStyle, const uint16_t *cls, const uint16_t *name, uint32_t style, int x, int y, int w, int h, void *parent, void *menu, void *inst, void *param)',
    ),
    DestroyWindow: user32.func('int __stdcall DestroyWindow(void *hwnd)'),
    DefWindowProcW: user32.func(
      'intptr_t __stdcall DefWindowProcW(void *hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)',
    ),
    PeekMessageW: user32.func(
      'int __stdcall PeekMessageW(_Out_ MSG *msg, void *hwnd, uint32_t min, uint32_t max, uint32_t remove)',
    ),
    TranslateMessage: user32.func('int __stdcall TranslateMessage(const MSG *msg)'),
    DispatchMessageW: user32.func('intptr_t __stdcall DispatchMessageW(const MSG *msg)'),
    RegisterWindowMessageW: user32.func(
      'uint32_t __stdcall RegisterWindowMessageW(const uint16_t *name)',
    ),
    PostMessageW: user32.func(
      'int __stdcall PostMessageW(void *hwnd, uint32_t msg, uintptr_t wp, intptr_t lp)',
    ),
    LoadImageW: user32.func(
      'void *__stdcall LoadImageW(void *inst, const uint16_t *name, uint32_t type, int cx, int cy, uint32_t load)',
    ),
    LoadIconW: user32.func('void *__stdcall LoadIconW(void *inst, const uint16_t *name)'),
    DestroyIcon: user32.func('int __stdcall DestroyIcon(void *icon)'),
    GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
    CreatePopupMenu: user32.func('void *__stdcall CreatePopupMenu()'),
    AppendMenuW: user32.func(
      'int __stdcall AppendMenuW(void *menu, uint32_t flags, uintptr_t id, const uint16_t *item)',
    ),
    TrackPopupMenu: user32.func(
      'int __stdcall TrackPopupMenu(void *menu, uint32_t flags, int x, int y, int reserved, void *hwnd, void *rect)',
    ),
    DestroyMenu: user32.func('int __stdcall DestroyMenu(void *menu)'),
    GetCursorPos: user32.func('int __stdcall GetCursorPos(_Out_ POINT *point)'),
    SetForegroundWindow: user32.func('int __stdcall SetForegroundWindow(void *hwnd)'),
    Shell_NotifyIconW: shell32.func(
      'int __stdcall Shell_NotifyIconW(uint32_t msg, NOTIFYICONDATAW *data)',
    ),
  };

  return cached;
}
