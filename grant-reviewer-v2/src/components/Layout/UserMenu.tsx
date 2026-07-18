import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  LogOut, 
  Settings, 
  Shield,
  ChevronDown,
  Bell,
  HelpCircle,
  Key,
  Activity
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const UserMenu: React.FC = () => {
  const { user, logout, hasPermission } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'program_officer':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'program_officer':
        return 'Program Officer';
      case 'admin':
        return 'Administrator';
      default:
        return 'Reviewer';
    }
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        className="flex items-center space-x-2 p-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <User className="h-4 w-4 text-blue-600" />
        </div>
        <div className="hidden md:block text-left">
          <div className="text-sm font-medium text-gray-900">
            {user.firstName} {user.lastName}
          </div>
          <div className="text-xs text-gray-500">{user.organization}</div>
        </div>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </Button>

      {isOpen && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown Menu */}
          <Card className="absolute right-0 top-full mt-2 w-80 z-20 shadow-lg">
            <CardContent className="p-0">
              {/* User Info Header */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm text-gray-600">{user.email}</div>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                      <span className="text-xs text-gray-500">{user.organization}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Items */}
              <div className="py-2">
                <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <User className="h-4 w-4 mr-3" />
                  Profile Settings
                </button>
                
                {hasPermission('manage:system') && (
                  <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    <Settings className="h-4 w-4 mr-3" />
                    System Settings
                  </button>
                )}
                
                <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Key className="h-4 w-4 mr-3" />
                  Change Password
                </button>
                
                <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Bell className="h-4 w-4 mr-3" />
                  Notifications
                  <Badge variant="destructive" className="ml-auto text-xs">
                    3
                  </Badge>
                </button>
                
                <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Activity className="h-4 w-4 mr-3" />
                  Activity Log
                </button>
                
                <div className="border-t my-2" />
                
                <button className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <HelpCircle className="h-4 w-4 mr-3" />
                  Help & Support
                </button>
                
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4 mr-3" />
                  Sign Out
                </button>
              </div>

              {/* Permissions Info */}
              <div className="p-4 border-t bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700">Access Level</span>
                  <Shield className="h-4 w-4 text-gray-500" />
                </div>
                <div className="text-xs text-gray-600">
                  {user.permissions.length} permissions active
                </div>
                {user.lastLogin && (
                  <div className="text-xs text-gray-500 mt-1">
                    Last login: {new Date(user.lastLogin).toLocaleDateString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default UserMenu;