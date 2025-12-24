import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import MemoriesView from './components/MemoriesView';
import TopicsView from './components/TopicsView';
import SearchView from './components/SearchView';
import SettingsView from './components/SettingsView';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  const [userId, setUserId] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    // Get or create userId
    const stored = localStorage.getItem('memoryLayerUserId');
    if (stored) {
      setUserId(stored);
    } else {
      const newUserId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('memoryLayerUserId', newUserId);
      setUserId(newUserId);
    }
  }, []);

  if (!userId) {
    return <div>Loading...</div>;
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">
          <h1>Memory Layer</h1>
        </div>
        <div className="nav-links">
          <Link to="/">Memories</Link>
          <Link to="/topics">Topics</Link>
          <Link to="/search">Search</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<MemoriesView userId={userId} apiUrl={API_URL} />} />
          <Route path="/topics" element={<TopicsView userId={userId} apiUrl={API_URL} />} />
          <Route path="/search" element={<SearchView userId={userId} apiUrl={API_URL} />} />
          <Route path="/settings" element={<SettingsView userId={userId} apiUrl={API_URL} />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;


