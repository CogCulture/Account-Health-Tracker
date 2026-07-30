import React from 'react';
import { Sun, Moon, BarChart3, History, HeartPulse } from 'lucide-react';

export default function DashboardShell({ activeTab, onTabChange, theme, onThemeToggle, children }) {
  return (
    <div className="app-container">
      <header className="header">
        <div className="header-logo">
          <HeartPulse size={28} style={{ color: 'var(--accent-primary)', fill: 'rgba(59, 130, 246, 0.1)' }} />
          <span>Account health</span>
        </div>
        
        <div className="header-controls">
          <nav className="nav-tabs" aria-label="Main Navigation">
            <button 
              className={`nav-tab ${activeTab === 'workspace' ? 'active' : ''}`}
              onClick={() => onTabChange('workspace')}
              aria-current={activeTab === 'workspace' ? 'page' : undefined}
            >
              <BarChart3 size={18} />
              <span>Workspace</span>
            </button>
            <button 
              className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => onTabChange('history')}
              aria-current={activeTab === 'history' ? 'page' : undefined}
            >
              <History size={18} />
              <span>History</span>
            </button>
          </nav>

          <button 
            className="theme-toggle" 
            onClick={onThemeToggle}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
