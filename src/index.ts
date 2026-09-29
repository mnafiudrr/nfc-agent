import { APP_NAME } from './app.js';
import {
  disableAutostart,
  enableAutostart,
  ensureAutostartOnFirstRun,
  isAutostartEnabled,
  isAutostartSupported,
} from './autostart.js';
import { loadConfig } from './config.js';
import { BufferedLogSink, ConsoleSink, FileSink, Logger, type LogSink } from './logger.js';
import { PcscReader } from './reader/PcscReader.js';
import { ReaderManagerImpl } from './reader/ReaderManager.js';
import { createTrayController } from './tray/createTray.js';
import { NoopTrayController } from './tray/NoopTrayController.js';
import type { TrayController } from './tray/types.js';
import { VERSION } from './version.js';
import { WebSocketServer } from './websocket/WebSocketServer.js';

const config = loadConfig();

// Feeds the tray's live log window; created up front so it captures startup
// lines logged before the tray exists.
const logBuffer = new BufferedLogSink();

const sinks: LogSink[] = [new ConsoleSink(), logBuffer];
if (config.logFile !== null) {
  sinks.push(new FileSink(config.logFile));
}
const log = new Logger(config.logLevel, sinks);

const pcsc = new PcscReader(log);
const readerManager = new ReaderManagerImpl(pcsc, log);
const wsServer = new WebSocketServer(readerManager, config, log);

let tray: TrayController = new NoopTrayController();
// Cached so the tray menu, which is built synchronously, can show a tick.
let autostartEnabled = false;
let shuttingDown = false;

function isAddressInUse(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === 'EADDRINUSE';
}

function refreshTray(): void {
  tray.setStatus({ state: readerManager.getState(), reader: readerManager.getCurrentReader() });
}

async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info(`Received ${reason}, shutting down...`);
  try {
    tray.stop();
    await wsServer.stop();
    log.info('Disconnecting reader...');
    await readerManager.stop();
  } catch (err) {
    log.error(`Error during shutdown: ${String(err)}`);
  }
  log.info('Agent stopped.');
  log.close();
  process.exit(0);
}

async function main(): Promise<void> {
  // "Agent started" must remain a contiguous substring of this line: the build
  // script's smoke test greps the log for it.
  log.info(`${APP_NAME} started (v${VERSION})`);
  log.info(`Executable: ${process.execPath}`);
  if (config.logFile !== null) {
    log.info(`Logging to ${config.logFile}`);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // Last-ditch guard so an abnormal exit does not strand the tray icon.
  process.on('exit', () => tray.stop());

  wsServer.wireReaderEvents();

  try {
    await wsServer.start();
  } catch (err) {
    if (isAddressInUse(err)) {
      // Packaged on Windows the agent has no console, so a second launch would
      // otherwise die invisibly. Treat it as "already running", not a failure.
      log.warn(`Agent already running on ${config.wsHost}:${config.wsPort}. Exiting.`);
      log.close();
      process.exit(0);
    }
    throw err;
  }

  if (isAutostartSupported()) {
    await ensureAutostartOnFirstRun(log, config.dataDir);
    autostartEnabled = await isAutostartEnabled();
  }

  tray = createTrayController(
    {
      wsUrl: `ws://${config.wsHost}:${config.wsPort}`,
      logFile: config.logFile,
      onQuit: () => void shutdown('tray Quit'),
      logBuffer,
      ...(isAutostartSupported()
        ? {
            autostart: {
              isEnabled: () => autostartEnabled,
              setEnabled: (enabled: boolean) => {
                // Flip the cached value first so the menu reflects the click
                // immediately; the registry write is confirmed just after.
                autostartEnabled = enabled;
                void (enabled ? enableAutostart(log) : disableAutostart(log)).then((ok) => {
                  if (!ok) {
                    autostartEnabled = !enabled;
                  }
                });
              },
            },
          }
        : {}),
    },
    log,
    config.dataDir,
  );
  tray.start();

  readerManager.on('readerConnected', () => {
    refreshTray();
    tray.notify(APP_NAME, 'Device is plugged');
  });
  readerManager.on('readerDisconnected', () => {
    refreshTray();
    tray.notify(APP_NAME, 'Device is unplugged');
  });
  readerManager.on('cardDetected', refreshTray);
  readerManager.on('cardRemoved', refreshTray);

  await readerManager.start();
  refreshTray();
}

main().catch((err) => {
  log.error(`Fatal error: ${String(err)}`);
  tray.stop();
  log.close();
  process.exit(1);
});
