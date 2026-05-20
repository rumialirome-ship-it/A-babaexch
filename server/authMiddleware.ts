import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const AUDIT_LOG_PATH = path.join(process.cwd(), 'audit_logs.json');

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: string;
        adminId?: string;
    };
}

export const logAdminAction = (adminId: string, dealerId: string, action: string, details: any = {}) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            adminId,
            dealerId,
            action,
            details
        };

        // Print to console
        console.error(`[AUDIT LOG] ${timestamp} | Admin: ${adminId} | Dealer: ${dealerId} | Action: ${action} | Details: ${JSON.stringify(details)}`);

        // Append to file
        let logs = [];
        if (fs.existsSync(AUDIT_LOG_PATH)) {
            try {
                const fileContent = fs.readFileSync(AUDIT_LOG_PATH, 'utf-8');
                logs = JSON.parse(fileContent);
                if (!Array.isArray(logs)) {
                    logs = [];
                }
            } catch (e) {
                logs = [];
            }
        }
        logs.push(logEntry);
        fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (e) {
        console.error('Failed to write audit log:', e);
    }
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: string; role: string };
        
        // Impersonation layer
        const impersonateHeader = req.headers['x-impersonate-dealer'];
        if (impersonateHeader && decoded.role === 'ADMIN') {
            req.user = {
                id: String(impersonateHeader),
                role: 'DEALER',
                adminId: decoded.id
            };
            // Log access
            const isReadRequest = req.method === 'GET';
            if (!isReadRequest) {
                logAdminAction(decoded.id, String(impersonateHeader), `Impersonated Action: ${req.method} ${req.path}`, {
                    body: req.body
                });
            }
        } else {
            req.user = decoded;
        }
        
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};
