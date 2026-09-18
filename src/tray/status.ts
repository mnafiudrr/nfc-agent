import type { TrayStatus } from './types.js';

// Shell_NotifyIcon truncates szTip at 128 UTF-16 units including the
// terminator, so keep tooltips comfortably under that.
export const MAX_TOOLTIP_LENGTH = 127;

const APP_NAME = 'ACR122U Agent';

export function statusLabel({ state, reader }: TrayStatus): string {
  switch (state) {
    case 'STARTING':
      return 'Starting...';
    case 'WAITING_FOR_READER':
      return 'Waiting for reader';
    case 'READER_CONNECTED':
    case 'WAITING_FOR_CARD':
      return reader ? `Ready - ${reader.name}` : 'Ready';
    case 'CARD_PRESENT':
      return reader ? `Card present - ${reader.name}` : 'Card present';
    default:
      return 'Unknown state';
  }
}

export function tooltip(status: TrayStatus): string {
  const text = `${APP_NAME}\n${statusLabel(status)}`;
  return text.length <= MAX_TOOLTIP_LENGTH ? text : `${text.slice(0, MAX_TOOLTIP_LENGTH - 3)}...`;
}
