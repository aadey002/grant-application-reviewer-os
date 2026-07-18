import React, { createContext, useContext, useReducer, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  organization: string;
  role: 'reviewer' | 'program_officer' | 'admin';
  permissions: string[];
  avatar?: string;
  lastLogin?: string;
  isActive: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionExpiry: Date | null;
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; sessionExpiry: Date } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER_START' }
  | { type: 'REGISTER_SUCCESS'; payload: { user: User; sessionExpiry: Date } }
  | { type: 'REGISTER_FAILURE'; payload: string }
  | { type: 'UPDATE_USER'; payload: Partial<User> }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SESSION_EXPIRED' };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  sessionExpiry: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
    case 'REGISTER_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    
    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        sessionExpiry: action.payload.sessionExpiry,
      };
    
    case 'LOGIN_FAILURE':
    case 'REGISTER_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
        sessionExpiry: null,
      };
    
    case 'LOGOUT':
    case 'SESSION_EXPIRED':
      return {
        ...initialState,
        error: action.type === 'SESSION_EXPIRED' ? 'Your session has expired. Please log in again.' : null,
      };
    
    case 'UPDATE_USER':
      return {
        ...state,
        user: state.user ? { ...state.user, ...action.payload } : null,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    
    default:
      return state;
  }
}

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organization: string;
    role: string;
  }) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  clearError: () => void;
  // Convenience getters
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Mock authentication service
class AuthService {
  private readonly STORAGE_KEY = 'grant_reviewer_auth';
  private readonly SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

  async login(email: string, password: string, remember = false): Promise<{ user: User; token: string; sessionExpiry: Date }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock validation
    const validCredentials = [
      { email: 'reviewer@hrsa.gov', password: 'demo123', role: 'reviewer' as const },
      { email: 'officer@samhsa.gov', password: 'demo123', role: 'program_officer' as const },
      { email: 'admin@hhs.gov', password: 'demo123', role: 'admin' as const },
      { email: 'admin@example.com', password: 'admin123', role: 'admin' as const }
    ];

    const credential = validCredentials.find(c => c.email === email && c.password === password);

    if (!credential) {
      throw new Error('Invalid email or password');
    }

    const sessionDuration = remember ? 30 * 24 * 60 * 60 * 1000 : this.SESSION_DURATION; // 30 days if remember
    const sessionExpiry = new Date(Date.now() + sessionDuration);

    const user: User = {
      id: 1,
      email: credential.email,
      firstName: credential.email.split('@')[0].split('.')[0] || 'Grant',
      lastName: 'Reviewer',
      organization: credential.email.includes('hrsa') ? 'HRSA' : 
                   credential.email.includes('samhsa') ? 'SAMHSA' : 'HHS',
      role: credential.role,
      permissions: this.getRolePermissions(credential.role),
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    const token = this.generateToken(user);

    // Always store session - use localStorage for "remember me", sessionStorage otherwise
    this.storeSession({ user, token, sessionExpiry }, remember);

    return { user, token, sessionExpiry };
  }

  async register(userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organization: string;
    role: string;
  }): Promise<{ user: User; token: string; sessionExpiry: Date }> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock validation - check if email already exists
    if (userData.email === 'reviewer@hrsa.gov') {
      throw new Error('An account with this email already exists');
    }

    const sessionExpiry = new Date(Date.now() + this.SESSION_DURATION);

    const user: User = {
      id: Math.floor(Math.random() * 1000) + 100,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      organization: userData.organization,
      role: userData.role as User['role'],
      permissions: this.getRolePermissions(userData.role as User['role']),
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    const token = this.generateToken(user);

    return { user, token, sessionExpiry };
  }

  logout(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.STORAGE_KEY);
  }

  getStoredSession(): { user: User; token: string; sessionExpiry: Date } | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY) || sessionStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const session = JSON.parse(stored);
      const sessionExpiry = new Date(session.sessionExpiry);

      if (sessionExpiry <= new Date()) {
        this.logout();
        return null;
      }

      return {
        ...session,
        sessionExpiry
      };
    } catch {
      return null;
    }
  }

  private storeSession(session: { user: User; token: string; sessionExpiry: Date }, remember = false): void {
    const sessionData = JSON.stringify(session);
    if (remember) {
      // Store in localStorage for persistent sessions
      localStorage.setItem(this.STORAGE_KEY, sessionData);
    } else {
      // Store in sessionStorage for session-only storage
      sessionStorage.setItem(this.STORAGE_KEY, sessionData);
    }
  }

  private generateToken(user: User): string {
    // Mock JWT token
    return btoa(JSON.stringify({ userId: user.id, email: user.email, exp: Date.now() + this.SESSION_DURATION }));
  }

  private getRolePermissions(role: User['role']): string[] {
    const permissions = {
      reviewer: [
        'read:documents',
        'create:evaluations',
        'read:evaluations',
        'update:evaluations',
        'export:evaluations'
      ],
      program_officer: [
        'read:documents',
        'create:documents',
        'update:documents',
        'create:evaluations',
        'read:evaluations',
        'update:evaluations',
        'delete:evaluations',
        'export:evaluations',
        'read:statistics'
      ],
      admin: [
        'read:documents',
        'create:documents',
        'update:documents',
        'delete:documents',
        'create:evaluations',
        'read:evaluations',
        'update:evaluations',
        'delete:evaluations',
        'export:evaluations',
        'read:statistics',
        'manage:users',
        'manage:system'
      ]
    };

    return permissions[role] || permissions.reviewer;
  }
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const authService = new AuthService();

  // Check for stored session on mount
  useEffect(() => {
    const storedSession = authService.getStoredSession();
    if (storedSession) {
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: storedSession.user,
          sessionExpiry: storedSession.sessionExpiry
        }
      });
    }
  }, []);

  // Check session expiry
  useEffect(() => {
    if (state.sessionExpiry) {
      const checkExpiry = () => {
        if (new Date() >= state.sessionExpiry!) {
          dispatch({ type: 'SESSION_EXPIRED' });
          authService.logout();
        }
      };

      const interval = setInterval(checkExpiry, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [state.sessionExpiry]);

  const login = async (email: string, password: string, remember = false) => {
    dispatch({ type: 'LOGIN_START' });
    
    try {
      const { user, sessionExpiry } = await authService.login(email, password, remember);
      dispatch({ 
        type: 'LOGIN_SUCCESS', 
        payload: { user, sessionExpiry } 
      });
    } catch (error) {
      dispatch({ 
        type: 'LOGIN_FAILURE', 
        payload: error instanceof Error ? error.message : 'Login failed' 
      });
      throw error;
    }
  };

  const register = async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organization: string;
    role: string;
  }) => {
    dispatch({ type: 'REGISTER_START' });
    
    try {
      const { user, sessionExpiry } = await authService.register(userData);
      dispatch({ 
        type: 'REGISTER_SUCCESS', 
        payload: { user, sessionExpiry } 
      });
    } catch (error) {
      dispatch({ 
        type: 'REGISTER_FAILURE', 
        payload: error instanceof Error ? error.message : 'Registration failed' 
      });
      throw error;
    }
  };

  const logout = () => {
    authService.logout();
    dispatch({ type: 'LOGOUT' });
  };

  const updateUser = (updates: Partial<User>) => {
    dispatch({ type: 'UPDATE_USER', payload: updates });
  };

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const hasPermission = (permission: string): boolean => {
    return state.user?.permissions.includes(permission) || false;
  };

  const value: AuthContextType = {
    state,
    login,
    register,
    logout,
    updateUser,
    clearError,
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    hasPermission,
  };

  return (
    <AuthContext.Provider value={value}>
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