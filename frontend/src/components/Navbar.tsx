import { Shield, Moon, Sun, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
// Dummy user data
const dummyUser = {
  firstName: "John",
  lastName: "Doe",
  email: "john.doe@example.com",
  imageUrl: "",
  fullName: "John Doe"
};
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export function Navbar({ isDarkMode, onToggleTheme }: NavbarProps) {
  const navigate = useNavigate();
  const user = dummyUser;
  const userEmail = user.email;
  const userInitials = user.firstName[0] + user.lastName[0];
  
  const signOut = (callback: () => void) => {
    // Handle sign out logic here
    console.log('User signed out');
    callback();
  };

  return (
    <nav className="flex items-center justify-between p-4 bg-card border-b border-border shadow-card">
      {/* Left side - Logo and App Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-gradient-primary rounded-lg shadow-glow">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Code Analyzer</h1>
      </div>

      {/* Right side - Theme toggle, User info, Sign out */}
      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleTheme}
          className="w-9 h-9 p-0 border-border hover:bg-muted transition-smooth group"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 group-hover:text-foreground" />
          ) : (
            <Moon className="w-4 h-4 group-hover:text-foreground" />
          )}
        </Button>

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.imageUrl} alt={userEmail} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium leading-none">
                    {user?.fullName || 'User'}
                  </p>
                </div>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut(() => navigate('/'))}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
import { Shield, Moon, Sun, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useUser, useClerk } from "@clerk/clerk-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavbarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export function Navbar({ isDarkMode, onToggleTheme }: NavbarProps) {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { user } = useUser();

  if (!user) return null;

  const userEmail = user.primaryEmailAddress?.emailAddress || '';
  const userFullName = user.fullName || 'User';
  const userInitials = userFullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const handleSignOut = () => {
    signOut(() => navigate('/'));
  };

  return (
    <nav className="flex items-center justify-between p-4 bg-card border-b border-border shadow-card">
      {/* Left side - Logo and App Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 bg-gradient-primary rounded-lg shadow-glow">
          <Shield className="w-5 h-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Code Analyzer</h1>
      </div>

      {/* Right side - Theme toggle, User info, Sign out */}
      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleTheme}
          className="w-9 h-9 p-0 border-border hover:bg-muted transition-smooth group"
        >
          {isDarkMode ? (
            <Sun className="w-4 h-4 group-hover:text-foreground" />
          ) : (
            <Moon className="w-4 h-4 group-hover:text-foreground" />
          )}
        </Button>

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                {user.imageUrl ? (
                  <AvatarImage src={user.imageUrl} alt={userFullName} />
                ) : (
                  <AvatarFallback>{userInitials}</AvatarFallback>
                )}
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userFullName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}