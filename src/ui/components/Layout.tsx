import { ReactNode, useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useNavigate } from "react-router-dom";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const [isMultiUser, setIsMultiUser] = useState(false);
  
  useEffect(() => {
    // Check if we're in multi-user mode
    const checkAuthMode = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        // Only show logout button if auth is explicitly required
        setIsMultiUser(data.authRequired === true);
      } catch (err) {
        console.error('Error checking auth mode:', err);
      }
    };
    
    checkAuthMode();
  }, []);
  
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };
  
  return (
    <div className="flex flex-col h-screen">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xl">qckfx</span>
        </div>
        <div className="flex items-center gap-2">
          {isMultiUser && (
            <button 
              onClick={handleLogout}
              className="text-sm px-3 py-1 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Log out
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
      <footer className="border-t py-2 px-4 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} qckfx</p>
      </footer>
    </div>
  );
}

export default Layout;