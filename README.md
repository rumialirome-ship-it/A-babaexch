# A-Baba Exchange - Production Deployment Guide

This comprehensive guide provides step-by-step instructions to deploy the A-Baba Exchange full-stack application on a fresh Ubuntu 22.04 server.

We will use:
-   **Vite** to build the frontend into optimized static assets.
-   **MySQL 8.0** as the robust database server.
-   **Nginx** as a reverse proxy to serve the frontend and route API requests.
-   **PM2** as a process manager to keep the Node.js backend running continuously.
-   **Certbot (Let's Encrypt)** to secure the application with a free SSL certificate (HTTPS).

---

### **Prerequisites**

1.  **Ubuntu 22.04 Server**: A clean installation of Ubuntu 22.04.
2.  **Domain Name**: A domain (`abexch.live`) with its DNS 'A' record pointing to your server's public IP address.
3.  **SSH Access**: You must be able to connect to your server via SSH.

---

### **Step 1: Initial Server Setup**

First, connect to your server via SSH and perform these initial configuration steps.

1.  **Update System Packages**:
    Ensure your server's package list and installed packages are up-to-date.
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```

2.  **Configure Firewall (UFW)**:
    We'll set up a basic firewall to allow only essential traffic (SSH, HTTP, and HTTPS).
    ```bash
    sudo ufw allow OpenSSH
    sudo ufw allow 'Nginx Full'
    sudo ufw enable
    ```
    When prompted, type `y` and press Enter to proceed.

3.  **Install Node.js with NVM**:
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 18
    nvm use 18
    nvm alias default 18
    ```

---

### **Step 2: Install MySQL Server**

This application uses MySQL. You must install and configure it before starting the backend.

1.  **Install MySQL**:
    ```bash
    sudo apt install mysql-server -y
    ```

2.  **Secure Installation**:
    Run the security script.
    ```bash
    sudo mysql_secure_installation
    ```
    - Press `y` for VALIDATE PASSWORD (optional, choose Low/0 if you want simple passwords).
    - Remove anonymous users? `y`
    - Disallow root login remotely? `y`
    - Remove test database? `y`
    - Reload privilege tables? `y`

3.  **Create Database User**:
    Log in to MySQL as root:
    ```bash
    sudo mysql
    ```
    Run the following SQL commands (Replace `your_password` with a strong password):
    ```sql
    -- Create user
    CREATE USER 'ababa_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
    
    -- Create database
    CREATE DATABASE ababa_db;
    
    -- Grant privileges
    GRANT ALL PRIVILEGES ON ababa_db.* TO 'ababa_user'@'localhost';
    FLUSH PRIVILEGES;
    EXIT;
    ```

---

### **Step 3: Upload Application Files**

1.  **Create Project Directory**:
    ```bash
    sudo mkdir -p /var/www/html/A-babaexch
    sudo chown -R $USER:$USER /var/www/html/A-babaexch
    ```

2.  **Upload Files from Local Machine**:
    ```bash
    # Run this on your LOCAL machine
    scp -r /path/to/your/project/* your_username@your_server_ip:/var/www/html/A-babaexch/
    ```

---

### **Step 4: Frontend Build**

1.  **Navigate to Project**:
    ```bash
    cd /var/www/html/A-babaexch
    ```

2.  **Install & Build**:
    ```bash
    npm install
    npm run build
    ```

---

### **Step 5: Backend Setup**

1.  **Navigate to Backend**:
    ```bash
    cd /var/www/html/A-babaexch/backend
    ```

2.  **Install Dependencies**:
    This is critical. It installs `mysql2` and `express`.
    ```bash
    npm install
    ```

3.  **Configure Environment (`.env`)**:
    Create the `.env` file.
    ```bash
    nano .env
    ```
    Add your configurations. **Use the password you created in Step 2**.
    ```env
    PORT=3001
    JWT_SECRET=your_super_secret_jwt_key
    API_KEY=your_gemini_api_key
    
    # MySQL Settings
    DB_HOST=localhost
    DB_USER=ababa_user
    DB_PASSWORD=your_password
    DB_NAME=ababa_db
    ```
    Save (`Ctrl+X`, `Y`, `Enter`).

4.  **Initialize Database Tables**:
    Run the setup script. This connects to MySQL and creates the required tables.
    ```bash
    npm run db:setup
    ```
    *If this fails, ensure your `.env` password is correct and you ran `npm install`.*

5.  **Start with PM2**:
    ```bash
    sudo npm install pm2 -g
    pm2 start server.js --name ababa-backend
    pm2 startup
    pm2 save
    ```

---

### **Step 6: Nginx Configuration**

1.  **Install Nginx**:
    ```bash
    sudo apt install nginx -y
    ```

2.  **Edit Config**:
    ```bash
    sudo nano /etc/nginx/sites-available/abexch.live
    ```
    Content:
    ```nginx
    server {
        listen 80;
        server_name abexch.live www.abexch.live;

        root /var/www/html/A-babaexch/dist;
        index index.html;

        location / {
            try_files $uri /index.html;
        }

        location /api/ {
            proxy_pass http://localhost:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  **Enable & Restart**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/abexch.live /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

---

### **Step 7: SSL (HTTPS)**

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d abexch.live -d www.abexch.live
```

---

### **Troubleshooting**

*   **Error: `Cannot find module 'mysql2/promise'`**:
    *   You missed `npm install` in the backend folder. Run it again.
*   **Database Connection Error**:
    *   Check `.env`. Ensure the `DB_PASSWORD` matches what you set in MySQL.
    *   Ensure MySQL is running: `sudo systemctl status mysql`.
*   **"502 Bad Gateway"**:
    *   Backend isn't running. Check logs: `pm2 logs ababa-backend`.
