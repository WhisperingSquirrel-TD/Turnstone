import { prepareClientBuild } from './client-build';
import { assertClientBuild } from './static-client';
const directory = process.argv[2];
if (!directory) throw new Error('A built client directory is required');
await assertClientBuild(directory);
await prepareClientBuild(directory);
await assertClientBuild(directory, { prepared: true });
