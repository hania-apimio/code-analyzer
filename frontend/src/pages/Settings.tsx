import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, LogOut, User, CreditCard, Bell, Lock, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import React, { useState, useEffect } from "react";

export default function SettingsPage() {
  const navigate = useNavigate();
  //const { signOut } = useUser();

  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const settings = [
    {
      title: "Account",
      description: "Update your account information",
      icon: <User className="w-5 h-5" />,
      onClick: () => navigate("/account"),
    },
    {
      title: "Billing",
      description: "Manage your subscription and payment methods",
      icon: <CreditCard className="w-5 h-5" />,
      onClick: () => navigate("/billing"),
    },
    {
      title: "Notifications",
      description: "Configure your notification preferences",
      icon: <Bell className="w-5 h-5" />,
      onClick: () => {},
    },
    {
      title: "Security",
      description: "Manage your password and security settings",
      icon: <Lock className="w-5 h-5" />,
      onClick: () => {},
    },
    {
      title: "Privacy",
      description: "Control your privacy settings",
      icon: <Shield className="w-5 h-5" />,
      onClick: () => {},
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar isDarkMode={isDarkMode} onToggleTheme={handleToggleTheme} />
      <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-6 mb-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8" 
            onClick={() => navigate(-1)}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7"/>
              <path d="M19 12H5"/>
            </svg>
          </Button>
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
        <p className="text-muted-foreground ml-12">Manage your account settings and preferences</p>
      </div>

    </div>
    </div>
  );
}
