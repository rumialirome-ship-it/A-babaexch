# Project Domain Rules

- **Server Port**: The backend MUST run on port **3000** for the AI Studio preview to work. For the final production server deployment, use port **3001** as required by your Nginx configuration.
- **Nginx Config**: Your production server uses Nginx as a reverse proxy pointing to `http://localhost:3001`.
