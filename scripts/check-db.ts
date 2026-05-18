import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database.sqlite');
const db = new Database(DB_PATH);

try {
    const games = db.prepare('SELECT * FROM games').all();
    console.log('Detected Games:', games.length);
    games.forEach(g => console.log(`- ${g.name} (${g.id})`));
    
    const admins = db.prepare('SELECT id FROM admins').all();
    console.log('Detected Admins:', admins.length);
    admins.forEach(a => console.log(`- ${a.id}`));

    const dealers = db.prepare('SELECT id FROM dealers').all();
    console.log('Detected Dealers:', dealers.length);
    
    const users = db.prepare('SELECT id FROM users').all();
    console.log('Detected Users:', users.length);
} catch (e) {
    console.error('Check failed:', e);
} finally {
    db.close();
}
