import * as database from '../server/database.js';
database.connect();
const games = database.getAllFromTable('games');
console.log('GAMES_IN_DB:', games.length);
if (games.length > 0) {
    console.log('FIRST_GAME:', JSON.stringify(games[0]));
}
process.exit(0);
