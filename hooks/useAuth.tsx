
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { Role, User, Dealer, Admin } from '../types';

interface AuthContextType {
  role: Role | null;
  account: User | Dealer | Admin | null;
  loading: boolean;
  login: (id: string, pass: string) => Promise<void>;
  logout: () => void;
  fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<Role | null>(null);
  const [account, setAccount] = useState<User | Dealer | Admin | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('ab_token'));
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setRole(null);
    setAccount(null);
    setToken(null);
    localStorage.removeItem('ab_token');
  }, []);

  const fetchWithAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) headers.append('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type')) headers.append('Content-Type', 'application/json');
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) logout();
    return res;
  }, [token, logout]);

  useEffect(() => {
    const verify = async () => {
      if (!token) { setLoading(false); return; }
      try {
        const res = await fetch('/api/auth/verify', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setAccount(data.account);
          setRole(data.role);
        } else { logout(); }
      } catch (e) { logout(); }
      finally { setLoading(false); }
    };
    verify();
  }, [token, logout]);

  const login = async (loginId: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login Failed');
    localStorage.setItem('ab_token', data.token);
    setToken(data.token);
    setAccount(data.account);
    setRole(data.role);
  };

  return (
    <AuthContext.Provider value={{ role, account, loading, login, logout, fetchWithAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('Auth Missing');
  return ctx;
};
