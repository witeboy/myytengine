import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Search, BarChart3, Home, Zap, ArrowLeft } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-gray-900">
      {/* Top Bar */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900 hidden sm:inline">
              Niche Profitability Engine
            </span>
          </div>
          <nav className="flex items-center gap-1">
            <Link
              to={createPageUrl("Dashboard")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors mr-1"
            >
              <ArrowLeft className="w-3 h-3" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="w-px h-4 bg-gray-200 mr-1" />
            {navItems.filter(n => nichePages.includes(n.page)).map((item) => (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  currentPageName === item.page
                    ? "bg-indigo-50 text-indigo-600"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
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