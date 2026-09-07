import { loadConfig } from './config.js';
import { Logger } from './logger.js';
import { PcscReader } from './reader/PcscReader.js';
import { ReaderManagerImpl } from './reader/ReaderManager.js';
import { WebSocketServer } from './websocket/WebSocketServer.js';

const config = loadConfig();
const log = new Logger(config.logLevel);

const pcsc = new PcscReader(log);
const readerManager = new ReaderManagerImpl(pcsc, log);
const wsServer = new WebSocketServer(readerManager, config, log);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down...`);
  try {
    await wsServer.stop();
    log.info('Disconnecting reader...');
    await readerManager.stop();
  } catch (err) {
    log.error(`Error during shutdown: ${String(err)}`);
  }
  log.info('Agent stopped.');
  process.exit(0);
}

async function main(): Promise<void> {
  log.info('Agent started');

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  wsServer.wireReaderEvents();
  await wsServer.start();
  await readerManager.start();
}

main().catch((err) => {
  log.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});
