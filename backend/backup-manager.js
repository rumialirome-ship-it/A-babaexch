const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
require('dotenv').config();

const BACKUP_DIR = path.join(__dirname, 'backups');
const DB_CONFIG = {
    host: (process.env.DB_HOST === 'localhost' || !process.env.DB_HOST) ? '127.0.0.1' : process.env.DB_HOST,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ababa_db',
};

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const clearScreen = () => console.log('\x1Bc');

function printHeader() {
    clearScreen();
    console.log('\x1b[36m%s\x1b[0m', '==========================================');
    console.log('\x1b[36m%s\x1b[0m', '   A-BABA EXCHANGE - DATABASE MANAGER     ');
    console.log('\x1b[36m%s\x1b[0m', '==========================================');
    console.log(`Database: \x1b[33m${DB_CONFIG.database}\x1b[0m`);
    console.log(`Host:     \x1b[33m${DB_CONFIG.host}\x1b[0m`);
    console.log('------------------------------------------\n');
}

function createBackup() {
    const timestamp = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `backup_${timestamp}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);

    console.log(`\n⏳ Creating backup: ${filename}...`);

    const env = { ...process.env, MYSQL_PWD: DB_CONFIG.password };
    const dump = spawn('mysqldump', [
        '-u', DB_CONFIG.user,
        '-h', DB_CONFIG.host,
        DB_CONFIG.database
    ], { env });

    const fileStream = fs.createWriteStream(filepath);

    dump.stdout.pipe(fileStream);

    dump.stderr.on('data', (data) => {
        // mysqldump outputs non-error info to stderr sometimes, but real errors too
        console.log(`[MySQL]: ${data}`);
    });

    dump.on('close', (code) => {
        if (code === 0) {
            console.log('\n\x1b[32m%s\x1b[0m', '✅ Backup created successfully!');
            console.log(`Saved to: backend/backups/${filename}`);
        } else {
            console.log('\n\x1b[31m%s\x1b[0m', '❌ Backup failed.');
        }
        askToContinue();
    });
}

function listBackups() {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql'));
    
    if (files.length === 0) {
        console.log('\n\x1b[33m%s\x1b[0m', 'ℹ️  No backups found.');
    } else {
        console.log('\n📂 Available Backups:');
        files.forEach((file, index) => {
            const stats = fs.statSync(path.join(BACKUP_DIR, file));
            const size = (stats.size / 1024 / 1024).toFixed(2) + ' MB';
            console.log(`[${index + 1}] ${file}  \x1b[2m(${size})\x1b[0m`);
        });
    }
    return files;
}

function viewBackups() {
    listBackups();
    askToContinue();
}

function restoreBackup() {
    const files = listBackups();

    if (files.length === 0) {
        console.log('Place your .sql backup file in backend/backups/ to restore it.');
        askToContinue();
        return;
    }

    console.log('\n[0] Cancel');

    rl.question('\nSelect a file number to restore: ', (answer) => {
        const index = parseInt(answer) - 1;
        if (answer === '0') {
            mainMenu();
            return;
        }

        if (index >= 0 && index < files.length) {
            const filename = files[index];
            const filepath = path.join(BACKUP_DIR, filename);

            rl.question(`\n\x1b[31m⚠️  WARNING: This will OVERWRITE database '${DB_CONFIG.database}'.\nAre you sure? (type 'yes' to confirm): \x1b[0m`, (confirm) => {
                if (confirm.toLowerCase() === 'yes') {
                    performRestore(filepath);
                } else {
                    console.log('Restore cancelled.');
                    askToContinue();
                }
            });
        } else {
            console.log('Invalid selection.');
            askToContinue();
        }
    });
}

function performRestore(filepath) {
    console.log(`\n⏳ Restoring from ${path.basename(filepath)}...`);

    const env = { ...process.env, MYSQL_PWD: DB_CONFIG.password };
    const restore = spawn('mysql', [
        '-u', DB_CONFIG.user,
        '-h', DB_CONFIG.host,
        DB_CONFIG.database
    ], { env });

    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(restore.stdin);

    restore.stderr.on('data', (data) => {
        console.log(`[MySQL]: ${data}`);
    });

    restore.on('close', (code) => {
        if (code === 0) {
            console.log('\n\x1b[32m%s\x1b[0m', '✅ Database restored successfully!');
            console.log('You should restart the backend server: pm2 restart ababa-backend');
        } else {
            console.log('\n\x1b[31m%s\x1b[0m', '❌ Restore failed.');
        }
        askToContinue();
    });
}

function askToContinue() {
    rl.question('\nPress Enter to return to menu...', () => {
        mainMenu();
    });
}

function mainMenu() {
    printHeader();
    console.log('1. \x1b[32mCreate New Backup\x1b[0m');
    console.log('2. \x1b[36mList Available Backups\x1b[0m');
    console.log('3. \x1b[33mRestore Backup\x1b[0m');
    console.log('4. Exit');
    
    rl.question('\nChoose an option: ', (answer) => {
        switch (answer) {
            case '1':
                createBackup();
                break;
            case '2':
                viewBackups();
                break;
            case '3':
                restoreBackup();
                break;
            case '4':
                console.log('Goodbye!');
                rl.close();
                process.exit(0);
                break;
            default:
                mainMenu();
        }
    });
}

// Start
mainMenu();