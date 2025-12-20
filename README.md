
# A-Baba Exchange - Production Deployment Guide (PostgreSQL Version)

This guide is updated for the **PostgreSQL** migration.

### **Prerequisites**

1.  **Ubuntu 22.04 Server**
2.  **Domain Name** (`abexch.live`)
3.  **PostgreSQL Installed and Running**:
    ```bash
    sudo apt update
    sudo apt install postgresql postgresql-contrib -y
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    ```

4.  **Database Configuration**:
    Create a user and database for the application.
    ```bash
    sudo -u postgres psql
    # Inside psql:
    CREATE DATABASE ababa_db;
    CREATE USER ababa_user WITH ENCRYPTED PASSWORD 'your_strong_password';
    GRANT ALL PRIVILEGES ON DATABASE ababa_db TO ababa_user;
    \q
    ```

---

### **Step 4: Backend Setup**

1.  **Environment File (`.env`)**:
    Update your `.env` with the PostgreSQL connection string.
    ```
    PORT=3001
    JWT_SECRET=your_secret_here
    DATABASE_URL=postgresql://ababa_user:your_strong_password@localhost:5432/ababa_db
    ```

2.  **Run Migration**:
    ```bash
    cd /var/www/html/A-babaexch/backend
    npm install
    npm run db:setup
    ```

3.  **Launch**:
    ```bash
    pm2 restart ababa-backend --update-env
    ```

### **Troubleshooting**

-   **Placeholder Mismatch**: If you see errors related to `?` in SQL, ensure `database.js` is using the `convertPlaceholders` helper.
-   **SSL Connection**: If using a remote PG instance (e.g., AWS RDS), you may need to append `?ssl=true` to your `DATABASE_URL`.
