import { closeIngestionResources, runIngestion } from './run.js';

try {
  const result = await runIngestion({ fullHistory: true });
  console.log(JSON.stringify(result, null, 2));
} finally { await closeIngestionResources(); }
