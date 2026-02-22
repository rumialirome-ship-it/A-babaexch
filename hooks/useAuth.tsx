
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Role, User, Dealer, Admin } from '../types';

interface AuthContextType {
    role: Role | null;
    account: User | Dealer | Admin | null;
    token: string | null;
    loading: boolean;
    verifyData: any;
    login: (id: string, pass: string) => Promise<void>;
    logout: () => void;
    setAccount: React.Dispatch<React.SetStateAction<User | Dealer | Admin | null>>;
    resetPassword: (id: string, contact: string, newPass: string) => Promise<string>;
    fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const parseAccountDates = (acc: any) => {
    if (acc && acc.ledger) {
        acc.ledger = acc.ledger.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) }));
    }
    return acc;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [role, setRole] = useState<Role | null>(null);
    const [account, setAccount] = useState<User | Dealer | Admin | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
    const [loading, setLoading] = useState<boolean>(true);
    const [verifyData, setVerifyData] = useState<any>(null);

    const logout = useCallback(() => {
        setRole(null); setAccount(null); setToken(null); setVerifyData(null);
        localStorage.removeItem('authToken');
    }, []);

    // FIX: fetchWithAuth no longer throws on non-2xx responses (except 401/403).
    // It returns the raw Response so callers can inspect response.ok and read
    // the body themselves. This prevents the "dead error handler" and "already 
    // consumed body" bugs that occurred when fetchWithAuth threw eagerly.
    const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
        const headers = new Headers(options.headers || {});
        const currentToken = token || localStorage.getItem('authToken');
        if (currentToken) headers.append('Authorization', `Bearer ${currentToken}`);
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.append('Content-Type', 'application/json');

        const response = await fetch(url, { ...options, headers });

        // Session-ending statuses — log out immediately.
        if (response.status === 401 || response.status === 403) {
            logout();
            throw new Error('Session expired');
        }

        // For all other statuses (including 4xx/5xx), return the response.
        // Callers are responsible for checking response.ok and reading the body.
        return response;
    }, [token, logout]);

    // FIX: Verify only once on mount / token change. Removed the 2-second polling
    // loop that was inside verify(), which caused:
    //   - Race conditions when token changed (multiple intervals stacking up)
    //   - Redundant load since App.tsx already polls /api/*/data every 3 seconds
    useEffect(() => {
        const verify = async () => {
            if (!token) { setLoading(false); return; }
            try {
                const response = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } });
                if (!response.ok) throw new Error('Fail');
                const data = await response.json();
                setAccount(parseAccountDates(data.account));
                setRole(data.role);
                setVerifyData(data);
                setLoading(false);
            } catch (e) { logout(); setLoading(false); }
        };
        verify();
    }, [token, logout]);

    const login = async (id: string, pass: string) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginId: id, password: pass })
        });
        // FIX: Read actual error message from server instead of generic "Login failed"
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || 'Login failed');
        }
        const data = await response.json();
        localStorage.setItem('authToken', data.token);
        setAccount(parseAccountDates(data.account));
        setRole(data.role);
        setToken(data.token);
    };

    // FIX: resetPassword is now fully implemented, calling the backend endpoint.
    const resetPassword = async (id: string, contact: string, newPass: string): Promise<string> => {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginId: id, contact, newPassword: newPass })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Reset failed');
        return data.message || 'Password updated successfully.';
    };

    return (
        <AuthContext.Provider value={{ role, account, token, loading, verifyData, login, logout, setAccount, resetPassword, fetchWithAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('Must use AuthProvider');
    return context;
};
