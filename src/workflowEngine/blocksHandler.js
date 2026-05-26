import { toCamelCase } from '@/utils/helper';
import customHandlers from '@business/blocks/backgroundHandler';

const blocksHandler = require.context('./blocksHandler', false, /\.js$/);
const handlers = blocksHandler.keys().reduce((acc, key) => {
  const name = key.replace(/^\.\/handler|\.js/g, '');

  acc[toCamelCase(name)] = blocksHandler(key).default;

  return acc;
}, {});

const offlineUnsupportedBlocks = [
  'aiWorkflow',
  'googleDrive',
  'googleSheets',
  'googleSheetsDrive',
  'webhook',
];

function offlineUnsupportedBlock() {
  throw new Error('This workflow block is disabled in local-only mode');
}

export default function () {
  const localHandlers = {
    ...handlers,
    ...customHandlers(),
  };

  offlineUnsupportedBlocks.forEach((blockName) => {
    localHandlers[blockName] = offlineUnsupportedBlock;
  });

  return localHandlers;
}
