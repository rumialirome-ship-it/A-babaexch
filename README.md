# A-Baba Exchange - Production Deployment Guide

This comprehensive guide provides step-by-step instructions to deploy the A-Baba Exchange full-stack application on a fresh Ubuntu 22.04 server.

We will use:
-   **Vite** to build the frontend into optimized static assets.
-   **SQLite** as the SQL database engine.
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

Next, we'll create the necessary directory and upload your application code from your local machine to the server.

1.  **Create Project Directory on the Server**:
    We will host the entire application in `/var/www/html/A-babaexch`.
    ```bash
    # Create the main project directory
    sudo mkdir -p /var/www/html/A-babaexch

    # Set the current user as the owner of this directory
    # This allows you to upload files without needing sudo.
    sudo chown -R $USER:$USER /var/www/html/A-babaexch
    ```

2.  **Upload Files from Local Machine**:
    Open a **new terminal on your local computer**. Use `scp` (secure copy) to transfer all your project files and folders (including the `backend` directory) into the server directory.

    ```bash
    # Replace /path/to/your/local/project/* with the actual path on your computer.
    # The '*' ensures the contents of the directory are copied.
    # Replace your_server_ip with your server's IP address.
    scp -r /path/to/your/local/project/* your_username@your_server_ip:/var/www/html/A-babaexch/
    ```
    After this step, your server's `/var/www/html/A-babaexch/` directory should contain your `index.html`, `package.json`, the `backend/` folder, and all other project files.

---

### **Step 3: Frontend Setup & Build**

Before setting up the backend, we need to install the frontend dependencies and create a production-ready build.

1.  **Navigate to the Project Directory**:
    ```bash
    cd /var/www/html/A-babaexch
    ```

2.  **Install Frontend Dependencies**:
    This command reads the root `package.json` file and installs libraries like React and Vite.
    ```bash
    npm install
    ```

3.  **Build the Frontend**:
    This script compiles the React/TypeScript application into static HTML, CSS, and JavaScript files inside a `dist` directory.
    ```bash
    npm run build
    ```
    After this step, you will have a new `/var/www/html/A-babaexch/dist` folder containing the optimized frontend assets.

---

### **Step 4: Backend Setup with PM2**

Now, let's configure and launch the Node.js backend application.

1.  **Navigate to the Backend Directory on the Server**:
    ```bash
    cd /var/www/html/A-babaexch/backend
    ```

2.  **Install Dependencies**:
    This reads `package.json` and installs the required libraries (Express, JWT, etc.).
    ```bash
    npm install
    ```
    
3.  **Install SQLite and Setup Database**:
    The application uses SQLite for its database.
    ```bash
    # Install the SQLite command-line tool
    sudo apt update && sudo apt install sqlite3 -y

    # Run the database setup script
    # This reads the initial data from db.json, creates a database.sqlite file,
    # and populates it with the necessary tables and data.
    npm run db:setup
    ```
    > **Note**: This setup script is designed to run only once. If you need to reset the database, you must first delete the `backend/database.sqlite` file. You can now safely remove `backend/db.json`.


4.  **Create Environment File (`.env`)**:
    This file stores your application's secrets.
    ```bash
    nano .env
    ```
    Add the following content. **It is critical to generate a strong, unique secret for `JWT_SECRET`**. You can use an online generator or a command like `openssl rand -base64 32`.
    ```
    PORT=3001
    JWT_SECRET=your_super_secret_and_long_jwt_key_here
    API_KEY=your_google_gemini_api_key_here
    ```
    > **Note**: The `API_KEY` is for the Google Gemini API. You can get a key from Google AI Studio. This is required for the "AI Lucky Pick" feature.
    
    Save and close the file (`Ctrl+X`, then `Y`, then `Enter`).

5.  **Install PM2 Globally**:
    PM2 is the process manager that will keep your backend running.
    ```bash
    sudo npm install pm2 -g
    ```

6.  **Start the Backend with PM2**:
    This command starts the server, names the process `ababa-backend`, and will restart it automatically if it crashes.
    ```bash
    pm2 start server.js --name ababa-backend
    ```

7.  **Configure PM2 to Start on Boot**:
    This ensures that if your server reboots, your application will automatically restart.
    ```bash
    pm2 startup
    ```
    Run the command that PM2 gives you (it will start with `sudo env...`).

8.  **Save the Process List**:
    ```bash
    pm2 save
    ```
    You can check the status of your backend anytime with `pm2 status`.

---

### **Step 5: Nginx Configuration (Reverse Proxy)**

Nginx will act as the web server. It will serve your built frontend files and forward API requests (`/api/...`) to your backend.

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

        # CRITICAL: Path to your project's *BUILD* folder.
        root /var/www/html/A-babaexch/dist;
        index index.html;

        # For single-page applications, this ensures that refreshing any page
        # still serves the main index.html file.
        location / {
            try_files $uri /index.html;
        }

        # Proxy API requests to the backend Node.js server running on port 3001
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
    > ### 🔴 **CRITICAL CONFIGURATION NOTE** 🔴
    > The `root` directive **must** point to the `/dist` subfolder, which contains the optimized production build from `npm run build`. Pointing it to the project's main directory (`/var/www/html/A-babaexch`) **will cause your application to fail** with a blank page and a `MIME type` error in the browser console.

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

### **Step 6: Secure Your Site with HTTPS (Let's Encrypt SSL)**

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

---

### **Updating the Application**

When you have new code changes to deploy, follow these steps to ensure they are applied correctly.

1.  **Upload New Files**:
    Use `scp` or another method to transfer your updated files to the server, overwriting the old ones. For example, to update the backend:
    ```bash
    # On your local machine
    scp -r /path/to/your/local/project/backend/* your_username@your_server_ip:/var/www/html/A-babaexch/backend/
    ```

2.  **Rebuild Frontend (if necessary)**:
    If you made changes to the frontend code (any file outside the `backend` directory), you must create a new build.
    ```bash
    # On the server
    cd /var/www/html/A-babaexch
    npm run build
    ```

3.  **Restart the Backend Process**:
    Simply running `pm2 restart` can sometimes fail to pick up all changes. A more reliable method is to use `reload`.
    ```bash
    # On the server
    pm2 reload ababa-backend
    ```
    Alternatively, for a complete refresh, you can delete and restart the process:
    ```bash
    # On the server
    pm2 delete ababa-backend
    cd /var/www/html/A-babaexch/backend
    pm2 start server.js --name ababa-backend
    pm2 save # Don't forget to save the process list again!
    ```

4.  **Check the Logs**:
    After restarting, immediately check the logs to confirm the new version is running and there are no errors.
    ```bash
    pm2 logs ababa-backend
    ```

---

### **Managing Your Application**

-   **View backend logs**: `pm2 logs ababa-backend`
-   **Restart the backend**: `pm2 restart ababa-backend`
-   **Stop the backend**: `pm2 stop ababa-backend`
-   **Check Nginx status**: `sudo systemctl status nginx`
-   **Restart Nginx**: `sudo systemctl restart nginx`

### **Troubleshooting**

-   **502 Bad Gateway Error**: This usually means Nginx can't connect to your backend.
    -   Check if the backend is running with `pm2 status`. If it has stopped or is in an errored state, check the logs with `pm2 logs ababa-backend`.
-   **Permission Errors**: If you have issues with the database file, ensure its directory has the correct permissions: `sudo chown -R $USER:$USER /var/www/html/A-babaexch/backend`.
-   **Changes Not Appearing**: If you update frontend files, you may need to clear your browser cache. For backend changes, restart the process with `pm2 reload ababa-backend`.
-   **Blank Page or Error: `Failed to load module script... MIME type of "application/octet-stream"`**:
    -   **Cause**: This is the most common deployment error. It means your Nginx web server is serving the **development** folder (`/var/www/html/A-babaexch`) instead of the **production build** folder (`/var/www/html/A-babaexch/dist`). The browser is receiving a raw TypeScript file (`.tsx`) which it cannot execute.
    -   **Solution**: You must fix your Nginx configuration. Follow these steps exactly:
        1.  Open the configuration file on your server:
            ```bash
            sudo nano /etc/nginx/sites-available/abexch.live
            ```
        2.  Find the line that starts with `root`. It will look like `root /path/to/your/project;`.
        3.  Ensure the line reads **exactly**:
            ```nginx
            root /var/www/html/A-babaexch/dist;
            ```
        4.  Save the file (`Ctrl+X`, then `Y`, then `Enter`).
        5.  Test the Nginx configuration for errors:
            ```bash
            sudo nginx -t
            ```
        6.  If the test is successful, restart Nginx to apply the change:
            ```bash
            sudo systemctl restart nginx
            ```
        7.  Finally, clear your browser's cache completely (a hard refresh with `Ctrl+Shift+R` or `Cmd+Shift+R` is recommended) and reload your website. The error should be gone.