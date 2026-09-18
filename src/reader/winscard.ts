import koffi from 'koffi';

/**
 * Minimal winscard.dll bindings used to ask "is the PC/SC service up, and is a
 * reader attached?" without blocking.
 *
 * This exists because constructing nfc-pcsc's NFC() never returns when the
 * Windows Smart Card service is stopped - which is the normal state when no
 * reader has ever been plugged in, since SCardSvr is trigger-started on reader
 * arrival. That froze the whole agent. SCardEstablishContext answers the same
 * question in single-digit milliseconds.
 *
 * Loaded lazily so this module stays importable on macOS.
 */

const SCARD_SCOPE_USER = 0;
const SCARD_S_SUCCESS = 0;

export const SCARD_E_NO_SERVICE = 0x8010001d | 0;
export const SCARD_E_NO_READERS_AVAILABLE = 0x8010002e | 0;

type Fn = (...args: unknown[]) => unknown;

interface WinscardApi {
  SCardEstablishContext: Fn;
  SCardListReadersW: Fn;
  SCardReleaseContext: Fn;
}

let cached: WinscardApi | null = null;

function loadWinscard(): WinscardApi {
  if (cached) {
    return cached;
  }
  const winscard = koffi.load('winscard.dll');
  cached = {
    SCardEstablishContext: winscard.func(
      'long __stdcall SCardEstablishContext(uint32_t scope, void *r1, void *r2, _Out_ void **ctx)',
    ),
    SCardListReadersW: winscard.func(
      'long __stdcall SCardListReadersW(void *ctx, const uint16_t *groups, _Out_ uint16_t *readers, _Inout_ uint32_t *len)',
    ),
    SCardReleaseContext: winscard.func('long __stdcall SCardReleaseContext(void *ctx)'),
  };
  return cached;
}

export interface PcscStatus {
  serviceUp: boolean;
  readers: string[];
}

export function decodeReaderNames(buffer: Uint16Array, length: number): string[] {
  return Buffer.from(buffer.buffer, 0, length * 2)
    .toString('utf16le')
    .split('\0')
    .filter((name) => name.length > 0);
}

/** Never throws for the ordinary "no service" / "no readers" cases. */
export function queryPcsc(): PcscStatus {
  const api = loadWinscard();
  const ctxBox: unknown[] = [null];

  const rc = Number(api.SCardEstablishContext(SCARD_SCOPE_USER, null, null, ctxBox));
  if (rc !== SCARD_S_SUCCESS) {
    return { serviceUp: false, readers: [] };
  }

  const ctx = ctxBox[0];
  try {
    const lenBox: number[] = [0];
    const sizeRc = Number(api.SCardListReadersW(ctx, null, null, lenBox));
    const length = lenBox[0] ?? 0;
    if (sizeRc !== SCARD_S_SUCCESS || length === 0) {
      return { serviceUp: true, readers: [] };
    }

    const buffer = new Uint16Array(length);
    const listRc = Number(api.SCardListReadersW(ctx, null, buffer, lenBox));
    if (listRc !== SCARD_S_SUCCESS) {
      return { serviceUp: true, readers: [] };
    }
    return { serviceUp: true, readers: decodeReaderNames(buffer, lenBox[0] ?? length) };
  } finally {
    try {
      api.SCardReleaseContext(ctx);
    } catch {
      // Releasing a context we just created should not fail; if it does there
      // is nothing useful to do about it.
    }
  }
}
