import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Search, BarChart3, Home, Zap } from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const navItems = [
    { name: "Dashboard", icon: Home, page: "Dashboard" },
    { name: "Research Terminal", icon: Search, page: "ResearchTerminal" },
    { name: "Results Grid", icon: BarChart3, page: "ResultsGrid" },
  ];

  // Pages that use the niche engine layout
  const nichePages = ["ResearchTerminal", "ResultsGrid"];
  const isNichePage = nichePages.includes(currentPageName);

  // For non-niche pages, just render children (existing app layout)
  if (!isNichePage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
      <style>{`
        :root {
          --niche-bg: #0a0a0f;
          --niche-surface: #12121a;
          --niche-border: #1e1e2e;
          --niche-accent: #6366f1;
          --niche-accent-glow: rgba(99, 102, 241, 0.15);
          --niche-gold: #f59e0b;
          --niche-green: #10b981;
          --niche-red: #ef4444;
        }
      `}</style>

      {/* Top Bar */}
      <header className="border-b border-[#1e1e2e] bg-[#12121a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-white hidden sm:inline">
              Niche Profitability Engine
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.filter(n => nichePages.includes(n.page)).map((item) => (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  currentPageName === item.page
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}