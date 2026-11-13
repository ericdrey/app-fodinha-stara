import { openDatabase } from '../src/database.js';
import { createApiHandler } from '../src/api.js';

let database;
export default createApiHandler({getDatabase:() => {
 database ??= openDatabase({cloud:true}).catch(error => { database = undefined; throw error; });
 return database;
}});
