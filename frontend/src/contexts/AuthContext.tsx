import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  avatar?: string;
  isVerified?: boolean;
  preferences?: {
    defaultInterviewType?: string;
    defaultDifficulty?: string;
    notifications?: boolean;
    theme?: 'light' | 'dark' | 'auto';
  };
  stats?: {
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, acceptedTerms: boolean, acceptedPrivacyPolicy: boolean) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = useCallback(async (activeToken: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });

      if (response.data.success) {
        setUser(response.data.data);
      } else {
        // Invalid token, clear it
        localStorage.removeItem('authToken');
        setToken(null);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Invalid/expired/revoked token — clear it.
      localStorage.removeItem('authToken');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch user profile on mount if token exists
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchUserProfile(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /** Re-fetches the current user — used after email verification so the unverified banner disappears without a full reload. */
  const refreshUser = async () => {
    if (!token) return;
    await fetchUserProfile(token);
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        email,
        password,
      });

      if (response.data.success) {
        const { token: newToken, user: userData } = response.data.data;
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('authToken', newToken);
      } else {
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Login failed';
      const code = error.response?.data?.code;
      const wrapped = new Error(message) as Error & { code?: string };
      if (code) wrapped.code = code;
      throw wrapped;
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    acceptedTerms: boolean,
    acceptedPrivacyPolicy: boolean
  ) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/register`, {
        name,
        email,
        password,
        acceptedTerms,
        acceptedPrivacyPolicy,
      });

      if (response.data.success) {
        const { token: newToken, user: userData } = response.data.data;
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('authToken', newToken);
      } else {
        throw new Error(response.data.message || 'Registration failed');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Registration failed';
      throw new Error(message);
    }
  };

  /** Revokes the session server-side FIRST (best-effort) — frontend local state is always cleared regardless of the API call's outcome. */
  const logout = async () => {
    const activeToken = token;
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    if (activeToken) {
      try {
        await axios.post(
          `${API_BASE_URL}/auth/logout`,
          {},
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
      } catch {
        // Local state is already cleared — a failed revoke call here is not user-visible.
      }
    }
  };

  const logoutAll = async () => {
    const activeToken = token;
    if (activeToken) {
      try {
        await axios.post(
          `${API_BASE_URL}/auth/logout-all`,
          {},
          { headers: { Authorization: `Bearer ${activeToken}` } }
        );
      } catch {
        // Even if the call fails, this device's own local state below still clears.
      }
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
  };

  const value: AuthContextType = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    logoutAll,
    refreshUser,
    isAuthenticated: !!user && !!token,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
