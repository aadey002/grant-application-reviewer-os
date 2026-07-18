import React from 'react';
import { useApp } from '@/contexts/AppContext';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { state } = useApp();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main content */}
      <div className={`transition-all duration-300 ${
        state.sidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        <Header />
        
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
