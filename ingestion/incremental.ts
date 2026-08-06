import { closeIngestionResources, runIngestion } from './run.js';

try {
  const result = await runIngestion({ days: 10 });
  console.log(JSON.stringify(result, null, 2));
} finally { await closeIngestionResources(); }
