import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Import the Tailwind CSS directives
import App from './App.tsx'; // Import your main App component

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement // TypeScript type assertion
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
