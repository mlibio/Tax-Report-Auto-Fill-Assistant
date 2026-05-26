import Dexie from 'dexie';

const dbLogs = new Dexie('logs');
dbLogs.version(1).stores({
  ctxData: '++id, logId',
  logsData: '++id, logId',
  histories: '++id, logId',
  items: '++id, name, endedAt, workflowId, status, collectionId',
});
dbLogs.version(2).stores({
  ctxData: '++id, logId',
  logsData: '++id, logId',
  histories: '++id, logId',
  items:
    '++id, name, startedAt, endedAt, workflowId, status, collectionId, duration, triggerType, errorMessage',
});

export const defaultLogItem = {
  name: '',
  endedAt: 0,
  message: '',
  startedAt: 0,
  parentLog: null,
  workflowId: null,
  status: 'success',
  duration: 0,
  triggerType: '',
  errorMessage: '',
  errorDetails: null,
  collectionId: null,
};

export default dbLogs;
