import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import AuthHandler from '@/lib/AuthHandler';
import '@/index.css';

// `/handler/*` is the sign-in surface and renders without the app shell, so an
// unauthenticated visitor never mounts the dashboard's data hooks.
const isAuthRoute = /^\/handler(?:\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  isAuthRoute ? <AuthHandler /> : <App />,
);
