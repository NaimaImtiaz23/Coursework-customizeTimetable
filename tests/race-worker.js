import { workerData, parentPort } from 'node:worker_threads';
import { openDatabase } from '../server/db.js';
import { register } from '../server/registration.js';
const db = openDatabase(workerData.path);
parentPort.postMessage(register(db, workerData.userId, 3));
db.close();
