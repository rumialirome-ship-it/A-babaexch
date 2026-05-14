import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database.sqlite');
const db = new Database(DB_PATH);

try {
    const games = db.prepare('SELECT * FROM games').all();
    console.error('Games in DB:', JSON.stringify(games, null, 2));
    const counts = {
        users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
        dealers: db.prepare('SELECT COUNT(*) as c FROM dealers').get().c,
        bets: db.prepare('SELECT COUNT(*) as c FROM bets').get().c,
        admins: db.prepare('SELECT COUNT(*) as c FROM admins').get().c,
    };
    console.error('Counts:', JSON.stringify(counts));
} catch (e) {
    console.error('Error querying DB:', e);
} finally {
    db.close();
}
