# A-Baba Exchange - Elite Production Deployment Guide

This guide provides precise, step-by-step instructions to deploy the "Elite Edition" of A-Baba Exchange on an Ubuntu server. This version features an advanced UI path, high-frequency synchronization, and strict protocol management.

We will use:
-   **Vite**: Frontend optimization.
-   **SQLite**: Self-contained SQL engine.
-   **Nginx**: Elite reverse proxy & SSL termination.
-   **PM2**: High-availability process management.
-   **Port 3001**: Dedicated backend synchronization port.

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
    Using Node Version Manager (nvm) is recommended as it allows you to manage multiple Node.js versions easily.
    ```bash
    # Download and run the nvm installation script
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

    # Source your shell configuration to start using nvm
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

    # Install Node.js version 18 (LTS) and set it as the default
    nvm install 18
    nvm use 18
    nvm alias default 18
    ```
    Verify the installation: `node -v` should show a version like `v18.x.x`.

---

### **Step 2: Upload Application Files**

Next, we'll create the necessary directory and upload your application code from your local machine to the server.

1.  **Create Project Directory on the Server**:
    We will host the entire application in `/var/www/html/A-babaexch`.
    ```bash
    # Create the main project directory
    sudo mkdir -p /var/www/html/A-babaexch

    # Set the current user as the owner of this directory
    sudo chown -R $USER:$USER /var/www/html/A-babaexch
    ```

2.  **Upload Files from Local Machine**:
    Use `scp` or `git` to transfer your project files.

    **Option A: Using Git (Recommended)**
    ```bash
    cd /var/www/html/A-babaexch
    git clone https://github.com/your-repo/A-babaexch.git .
    ```

    **Option B: Using SCP**
    ```bash
    # Run this on your LOCAL computer
    scp -r /path/to/your/project/* your_username@your_server_ip:/var/www/html/A-babaexch/
    ```

---

### **Step 3: Installation & Build**

Now we install dependencies and build both the frontend and the backend bundle.

1.  **Navigate to the Project Directory**:
    ```bash
    cd /var/www/html/A-babaexch
    ```

2.  **Install All Dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Database**:
    Initialize the SQLite database with seed data.
    ```bash
    npm run setup-db
    ```

4.  **Build the Application**:
    This command builds the frontend (into `dist/`) and the backend server (into `dist/server.mjs`).
    ```bash
    npm run build
    ```

---

### **Step 4: Backend Setup with PM2**

Now, let's launch the bundled Node.js server.

1.  **Create Environment File (`.env`)**:
    ```bash
    nano .env
    ```
    Add the following content (Change the secrets!):
    ```env
    PORT=3001
    JWT_SECRET=your_super_secret_jwt_key
    GEMINI_API_KEY=your_google_ai_studio_key
    NODE_ENV=production
    ```
    Save and close (`Ctrl+X`, then `Y`, then `Enter`).

2.  **Start the Server with PM2**:
    We point PM2 to the bundled ESM server file.
    ```bash
    pm2 start dist/server.mjs --name ababa-backend
    ```

3.  **Configure PM2 to Start on Boot**:
    ```bash
    pm2 startup
    # Run the command PM2 displays in your terminal
    pm2 save
    ```

4.  **Verify Status**:
    ```bash
    pm2 status
    pm2 logs ababa-backend
    ```

---

### **Step 5: Nginx Configuration (Reverse Proxy)**

Nginx will serve the static files and proxy API requests to port 3001.

1.  **Create Nginx Config**:
    ```bash
    sudo nano /etc/nginx/sites-available/ababaexch
    ```

2.  **Add Configuration**:
    ```nginx
    server {
        listen 80;
        server_name yourdomain.com; # Replace with your actual domain

        root /var/www/html/A-babaexch/dist;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
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

3.  **Enable and Restart**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/ababaexch /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

---
    > ## 🔴 CRITICAL: The `root` Path is EVERYTHING! 🔴
    >
    > The most common deployment failure is setting this path incorrectly. It **MUST** point to the `/dist` subfolder.
    >
    > **Correct Structure:**
    > ```
    > /var/www/html/A-babaexch/   <-- DO NOT point here
    > └── dist/                   <-- DO point here
    >     └── index.html          <-- The real app
    > ```
    >
    > If you point it to the project root, your site will show a **"CRITICAL DEPLOYMENT MISCONFIGURATION"** error page and will not load. Double-check this line before saving.

    Save and close the file.

### **Step 6: Secure Your Site with HTTPS (Certbot)**

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

### **Updating the Application**

1.  **Pull/Upload Changes**:
    ```bash
    cd /var/www/html/A-babaexch
    git pull origin main
    # OR upload via SCP
    ```

2.  **Rebuild**:
    ```bash
    npm install
    npm run build
    ```

3.  **Restart PM2**:
    ```bash
    pm2 restart ababa-backend --update-env
    ```

---

### **Troubleshooting**

#### **1. Database Issues**
If games don't show or login fails, reset the database:
```bash
pm2 stop ababa-backend
rm database.sqlite
npm run setup-db
pm2 start ababa-backend
```

#### **2. Git Pull Conflicts (SQLite)**
If `database.sqlite` blocks a git pull:
```bash
git stash --include-untracked
git pull origin main
git stash pop
```

#### **3. Express 5 Wildcard Errors**
If you see `PathError: Missing parameter name`, ensure your wildcard route in `server.ts` uses regex:
```js
app.get(/^\/(?!api).*/, (req, res) => { ... });
```

#### **4. Nginx 502 Bad Gateway**
- Check PM2 status: `pm2 status`
- Check logs: `pm2 logs ababa-backend`
- Ensure PM2 is running on **3001** and Nginx matches.

---

### **Managing Your Application**

- **Logs**: `pm2 logs ababa-backend`
- **Restart**: `pm2 restart ababa-backend`
- **Nginx Status**: `sudo systemctl status nginx`
