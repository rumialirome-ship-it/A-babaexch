import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Role, User, Dealer, Admin } from '../types';

interface AuthContextType {
    role: Role | null;
    account: User | Dealer | Admin | null;
    token: string | null;
    loading: boolean;
    login: (id: string, pass: string) => Promise<void>;
    logout: () => void;
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

    const logout = useCallback(() => {
        setRole(null);
        setAccount(null);
        setToken(null);
        localStorage.removeItem('authToken');
    }, []);
    
    const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
        const headers = new Headers(options.headers || {});
        const currentToken = token || localStorage.getItem('authToken');
        if (currentToken) {
            headers.append('Authorization', `Bearer ${currentToken}`);
        }
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
            headers.append('Content-Type', 'application/json');
        }
        
        const fetchOptions: RequestInit = { ...options, headers };

        if (!fetchOptions.method || fetchOptions.method.toUpperCase() === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            url = `${url}${separator}cacheBust=${new Date().getTime()}`;
        }

        const response = await fetch(url, fetchOptions);

        if (response.status === 401 || response.status === 403) {
            logout();
            throw new Error('Session expired. Please log in again.');
        }
        
        return response;
    }, [token, logout]);
    
    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;
        let pollInterval: ReturnType<typeof setInterval> | undefined;

        const verifyTokenAndPoll = async () => {
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const response = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` }, signal });
                if (!response.ok) throw new Error('Token verification failed');
                
                const data = await response.json();
                setAccount(parseAccountDates(data.account));
                setRole(data.role);

                if (data.role === Role.User || data.role === Role.Dealer) {
                    pollInterval = setInterval(async () => {
                        try {
                            const pollResponse = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` }});
                            if (pollResponse.ok) {
                                const pollData = await pollResponse.json();
                                setAccount(parseAccountDates(pollData.account));
                            } else {
                                logout();
                            }
                        } catch (error) {
                            console.error("Polling for account update failed:", error);
                            logout();
                        }
                    }, 3000);
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    console.log('Session verification fetch aborted.');
                } else {
                    console.error("Session verification failed:", error);
                    logout();
                }
            } finally {
                setLoading(false);
            }
        };

        verifyTokenAndPoll();
        
        return () => {
            controller.abort();
            if (pollInterval) {
                clearInterval(pollInterval);
            }
        };
    }, [token, logout]);


    const login = async (loginId: string, loginPass: string) => {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginId, password: loginPass })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Login failed");
        }

        const { token: newToken, role: newRole, account: newAccount } = await response.json();
        localStorage.setItem('authToken', newToken);
        setAccount(parseAccountDates(newAccount));
        setRole(newRole);
        setToken(newToken);
    };
    
    const resetPassword = async (accountId: string, contact: string, newPassword: string): Promise<string> => {
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId, contact, newPassword })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to reset password.');
        }
        return data.message;
    };

    return (
        <AuthContext.Provider value={{ role, account, token, loading, login, logout, resetPassword, fetchWithAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};