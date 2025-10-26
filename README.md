# A-Baba Exchange - Production Deployment Guide

This comprehensive guide provides step-by-step instructions to deploy the A-Baba Exchange full-stack application on a fresh Ubuntu 22.04 server.

We will use:
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

Next, we'll create the necessary directories and upload your application code from your local machine to the server.

1.  **Create Project Directories on the Server**:
    We will host our application in `/var/www/abexch.live`.
    ```bash
    # Create the main directory and subdirectories for frontend (html) and backend
    sudo mkdir -p /var/www/abexch.live/html
    sudo mkdir -p /var/www/abexch.live/backend

    # Set the current user as the owner of these directories
    sudo chown -R $USER:$USER /var/www/abexch.live
    ```

2.  **Upload Files from Local Machine**:
    Open a **new terminal on your local computer** (not the server SSH session). Use the `scp` (secure copy) command to transfer your files.

    *   **Upload the backend:**
        ```bash
        # Replace /path/to/your/local/backend/* with the actual path on your computer
        # Replace your_server_ip with your server's IP address
        scp -r /path/to/your/local/backend/* your_username@your_server_ip:/var/www/abexch.live/backend/
        ```
    *   **Upload the frontend:**
        ```bash
        # Replace /path/to/your/local/frontend/* with the actual path
        scp -r /path/to/your/local/frontend/* your_username@your_server_ip:/var/www/abexch.live/html/
        ```
    *Note: The `frontend` files are everything in your project's root *except* the `backend` directory.*

---

### **Step 3: Backend Setup with PM2**

Now, let's configure and launch the Node.js backend application.

1.  **Navigate to the Backend Directory on the Server**:
    ```bash
    cd /var/www/abexch.live/backend
    ```

2.  **Install Dependencies**:
    This reads `package.json` and installs the required libraries (Express, JWT, etc.).
    ```bash
    npm install
    ```

3.  **Create Environment File (`.env`)**:
    This file stores your application's secrets.
    ```bash
    nano .env
    ```
    Add the following content. **It is critical to generate a strong, unique secret for `JWT_SECRET`**. You can use an online generator or a command like `openssl rand -base64 32`.
    ```
    PORT=5000
    JWT_SECRET=your_super_secret_and_long_jwt_key_here
    ```
    Save and close the file (`Ctrl+X`, then `Y`, then `Enter`).

4.  **Install PM2 Globally**:
    PM2 is the process manager that will keep your backend running.
    ```bash
    sudo npm install pm2 -g
    ```

5.  **Start the Backend with PM2**:
    This command starts the server, names the process `ababa-backend`, and will restart it automatically if it crashes.
    ```bash
    pm2 start server.js --name ababa-backend
    ```

6.  **Configure PM2 to Start on Boot**:
    This ensures that if your server reboots, your application will automatically restart.
    ```bash
    pm2 startup
    ```
    Run the command that PM2 gives you (it will start with `sudo env...`).

7.  **Save the Process List**:
    ```bash
    pm2 save
    ```
    You can check the status of your backend anytime with `pm2 status`.

---

### **Step 4: Nginx Configuration (Reverse Proxy)**

Nginx will act as the web server. It will serve your frontend files and forward API requests (`/api/...`) to your backend.

1.  **Install Nginx**:
    ```bash
    sudo apt install nginx -y
    ```

2.  **Create an Nginx Configuration File**:
    ```bash
    sudo nano /etc/nginx/sites-available/abexch.live
    ```

3.  **Add the following configuration**:
    This file tells Nginx how to handle requests for `abexch.live`.
    ```nginx
    server {
        listen 80;
        server_name abexch.live www.abexch.live;

        # Path to your frontend files
        root /var/www/abexch.live/html;
        index index.html;

        # For single-page applications, this ensures that refreshing any page
        # still serves the main index.html file.
        location / {
            try_files $uri /index.html;
        }

        # Proxy API requests to the backend Node.js server running on port 5000
        location /api/ {
            proxy_pass http://localhost:5000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
    Save and close the file.

4.  **Enable the Site**:
    This creates a link from the `sites-available` directory to the `sites-enabled` directory, which Nginx reads from.
    ```bash
    sudo ln -s /etc/nginx/sites-available/abexch.live /etc/nginx/sites-enabled/
    ```

5.  **Test and Restart Nginx**:
    ```bash
    sudo nginx -t  # Test for syntax errors
    sudo systemctl restart nginx
    ```
    If the test is successful, your site should now be accessible at `http://abexch.live`.

---

### **Step 5: Secure Your Site with HTTPS (Let's Encrypt SSL)**

Finally, we will secure your site with a free SSL certificate.

1.  **Install Certbot**:
    Certbot is the tool that automates obtaining and renewing SSL certificates.
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

2.  **Obtain and Install the SSL Certificate**:
    This command will automatically detect your domain from the Nginx configuration, get a certificate, and update your Nginx file to use HTTPS.
    ```bash
    sudo certbot --nginx -d abexch.live -d www.abexch.live
    ```
    Follow the on-screen prompts:
    -   Enter your email address (for renewal notices).
    -   Agree to the terms of service.
    -   Choose whether to share your email.
    -   When asked about redirecting HTTP traffic, choose option `2` to redirect. This is highly recommended for security.

3.  **Verify Automatic Renewal**:
    Certbot sets up a scheduled task to renew your certificate automatically. You can test it with a dry run.
    ```bash
    sudo certbot renew --dry-run
    ```
    If there are no errors, you're all set.

---

### **Deployment Complete!**

Your A-Baba Exchange platform is now live and secure. You can access it at **`https://abexch.live`**.

### **Managing Your Application**

-   **View backend logs**: `pm2 logs ababa-backend`
-   **Restart the backend**: `pm2 restart ababa-backend`
-   **Stop the backend**: `pm2 stop ababa-backend`
-   **Check Nginx status**: `sudo systemctl status nginx`
-   **Restart Nginx**: `sudo systemctl restart nginx`

### **Troubleshooting**

-   **502 Bad Gateway Error**: This usually means Nginx can't connect to your backend.
    -   Check if the backend is running with `pm2 status`. If it has stopped or is in an errored state, check the logs with `pm2 logs ababa-backend`.
-   **Permission Errors**: If you have issues writing files (like `db.json`), ensure the directory permissions are correct: `sudo chown -R $USER:$USER /var/www/abexch.live`.
-   **Changes Not Appearing**: If you update frontend files, you may need to clear your browser cache. For backend changes, restart the process with `pm2 restart ababa-backend`.
