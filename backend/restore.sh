#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}==============================================${NC}"
echo -e "${YELLOW}   A-Baba Exchange - Data Restoration Tool    ${NC}"
echo -e "${YELLOW}==============================================${NC}"

# Check if we are in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from inside the 'backend' directory.${NC}"
    exit 1
fi

# Check for the SQLite file
if [ ! -f "database.sqlite" ]; then
    echo -e "${RED}Error: 'database.sqlite' not found.${NC}"
    echo "Please upload your backup 'database.sqlite' file to this folder before running this script."
    exit 1
fi

echo -e "\n${YELLOW}[Step 1/3] Installing Dependencies...${NC}"
# We explicitly install better-sqlite3 to ensure the migration script can read the old file
npm install
npm install better-sqlite3

if [ $? -ne 0 ]; then
    echo -e "${RED}Dependency installation failed.${NC}"
    exit 1
fi

echo -e "\n${YELLOW}[Step 2/3] Setting up MySQL Tables...${NC}"
node setup-mysql.js

if [ $? -ne 0 ]; then
    echo -e "${RED}MySQL Setup failed. Check your .env file credentials.${NC}"
    exit 1
fi

echo -e "\n${YELLOW}[Step 3/3] Migrating Data from SQLite to MySQL...${NC}"
node migrate-data.js

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}==============================================${NC}"
    echo -e "${GREEN}   RESTORE COMPLETED SUCCESSFULLY!            ${NC}"
    echo -e "${GREEN}==============================================${NC}"
    echo -e "You can now start your server using: ${YELLOW}pm2 start server.js --name ababa-backend${NC}"
else
    echo -e "\n${RED}Migration failed. Please check the errors above.${NC}"
fi