const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log("\x1b[36m%s\x1b[0m", "--- A-BABA EXCHANGE RESTORATION TOOL ---");

try {
    // 1. Install Base Dependencies
    console.log("\n\x1b[33m1. Installing project dependencies...\x1b[0m");
    execSync('npm install', { stdio: 'inherit' });

    // 2. Install SQLite adapter (needed to read the old DB file)
    console.log("\n\x1b[33m2. Installing SQLite adapter (better-sqlite3)...\x1b[0m");
    execSync('npm install better-sqlite3', { stdio: 'inherit' });

    // 3. Setup MySQL Schema
    console.log("\n\x1b[33m3. Initializing MySQL Database & Tables...\x1b[0m");
    execSync('node setup-mysql.js', { stdio: 'inherit' });

    // 4. Migrate Data
    const sqlitePath = path.join(__dirname, 'database.sqlite');
    if (fs.existsSync(sqlitePath)) {
        console.log("\n\x1b[33m4. Found 'database.sqlite'. Starting migration to MySQL...\x1b[0m");
        execSync('node migrate-data.js', { stdio: 'inherit' });
    } else {
        console.log("\n\x1b[33m4. 'database.sqlite' not found. Skipping data migration.\x1b[0m");
        console.log("   (If you have an old database file, upload it to the backend folder and run this again.)");
    }

    console.log("\n\x1b[32m✅ RESTORATION COMPLETE!\x1b[0m");
    console.log("You can now start the server using: \x1b[36mnpm start\x1b[0m");

} catch (error) {
    console.error("\n\x1b[31m❌ RESTORATION FAILED\x1b[0m");
    console.error("Error details:");
    console.error(error.message);
    process.exit(1);
}