# Project Domain Rules

- **Server Port**: The backend MUST always run on port **3001**. 
- **Nginx Config**: The production server uses Nginx as a reverse proxy pointing to `http://localhost:3001`. Changing the port to 3000 will cause "Bad Gateway" errors on the user's live server.
