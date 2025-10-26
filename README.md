# A-Baba Exchange - Deployment Guide

This guide provides step-by-step instructions to deploy the A-Baba Exchange full-stack application on an Ubuntu 22.04 VPS. We will use Nginx as a reverse proxy to serve the frontend and route API requests, and PM2 to manage the Node.js backend process.

## Prerequisites

- An Ubuntu 22.04 server.
- A domain name (`abexch.live`) pointed to your server's IP address.
- Node.js (version 18.x or later) and npm installed. You can install them with `nvm` or by running:
  ```bash
  sudo apt update
  sudo apt install nodejs npm -y
  ```

## Project Structure

Your project should have the following structure on the server, for example in `/var/www/abexch.live`:

```
/var/www/abexch.live/
├── backend/            # Contains all backend files (server.js, package.json, etc.)
└── html/               # Contains all frontend files (index.html, index.tsx, components, etc.)
```

## Step 1: Backend Setup

The backend is a Node.js Express application that serves the API.

1.  **Navigate to the backend directory:**
    ```bash
    cd /var/www/abexch.live/backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create an environment file (`.env`):**
    This file stores sensitive configuration.
    ```bash
    nano .env
    ```
    Add the following content. **Generate a strong, unique secret for `JWT_SECRET`**.
    ```
    PORT=5000
    JWT_SECRET=your_super_secret_and_long_jwt_key_here
    ```
    Save and close the file (Ctrl+X, then Y, then Enter).

4.  **Install PM2 Process Manager:**
    PM2 will keep your backend running forever and restart it if it crashes.
    ```bash
    sudo npm install pm2 -g
    ```

5.  **Start the backend with PM2:**
    ```bash
    pm2 start server.js --name ababa-backend
    ```

6.  **Enable PM2 to start on system boot:**
    ```bash
    pm2 startup
    ```
    (Follow the on-screen instructions, which will ask you to run a command with `sudo`).

7.  **Save the current process list:**
    ```bash
    pm2 save
    ```

Your backend is now running on `http://localhost:5000`.

## Step 2: Frontend Setup

The frontend consists of static files that will be served by Nginx.

1.  **Place your frontend files** (index.html, index.tsx, components, etc.) inside the `/var/www/abexch.live/html/` directory.

## Step 3: Nginx Setup (Reverse Proxy)

Nginx will handle incoming traffic on port 80. It will serve the frontend files directly and forward any API requests (e.g., `/api/...`) to our backend Node.js application.

1.  **Install Nginx:**
    ```bash
    sudo apt update
    sudo apt install nginx -y
    ```

2.  **Create a new Nginx configuration file for your site:**
    ```bash
    sudo nano /etc/nginx/sites-available/abexch.live
    ```

3.  **Add the following configuration.** This file tells Nginx how to handle requests for `abexch.live`.

    ```nginx
    server {
        listen 80;
        server_name abexch.live www.abexch.live;

        # Path to your frontend files
        root /var/www/abexch.live/html;
        index index.html;

        location / {
            try_files $uri /index.html;
        }

        # Proxy API requests to the backend Node.js server
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
    Save and close the file (Ctrl+X, then Y, then Enter).

4.  **Enable the site by creating a symbolic link:**
    ```bash
    sudo ln -s /etc/nginx/sites-available/abexch.live /etc/nginx/sites-enabled/
    ```

5.  **Test the Nginx configuration for errors:**
    ```bash
    sudo nginx -t
    ```
    If it shows `syntax is ok` and `test is successful`, you can proceed.

6.  **Restart Nginx to apply the changes:**
    ```bash
    sudo systemctl restart nginx
    ```

## Deployment Complete!

Your A-Baba Exchange platform is now live. You can access it by navigating to `http://abexch.live` in your browser.

### Managing the Application

-   **View backend logs:** `pm2 logs ababa-backend`
-   **Restart the backend:** `pm2 restart ababa-backend`
-   **Stop the backend:** `pm2 stop ababa-backend`
-   **Check Nginx status:** `sudo systemctl status nginx`
