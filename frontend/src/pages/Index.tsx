import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { MainTabs } from "@/components/MainTabs";

const Index = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleToggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    // In a real app, you'd implement proper dark mode toggle
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar isDarkMode={isDarkMode} onToggleTheme={handleToggleTheme} />
      <MainTabs />
    </div>
  );
};

export default Index;
