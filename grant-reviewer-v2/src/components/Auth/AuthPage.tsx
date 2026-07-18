import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import { useAuth } from '@/contexts/AuthContext';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const { login, register, isLoading, error } = useAuth();

  const handleLogin = async (credentials: { email: string; password: string; remember?: boolean }) => {
    await login(credentials.email, credentials.password, credentials.remember);
  };

  const handleRegister = async (userData: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    organization: string;
    role: string;
  }) => {
    await register(userData);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Grant Reviewer v2
          </h1>
          <p className="text-gray-600">
            Professional federal grant review and document management system
          </p>
        </div>

        {/* Auth Forms */}
        {isLogin ? (
          <LoginForm
            onLogin={handleLogin}
            onSwitchToRegister={() => setIsLogin(false)}
            isLoading={isLoading}
            error={error}
          />
        ) : (
          <RegisterForm
            onRegister={handleRegister}
            onSwitchToLogin={() => setIsLogin(true)}
            isLoading={isLoading}
            error={error}
          />
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>
            Secure • Private • FISMA Compliant
          </p>
          <p className="mt-2">
            Built for federal grant review professionals
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;