import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

console.log('[App] Audio Manager starting...');

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);

console.log('[App] React mounted');
