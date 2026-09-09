import React from 'react';
import ReactDOM from 'react-dom/client';
import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css';
import App from '@/App.jsx';
import AuthHandler from '@/lib/AuthHandler';
import { authClient } from '@/lib/neon-auth';
import '@/index.css';

const isAuthRoute = /^\/handler(?:\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')).render(
  <NeonAuthUIProvider authClient={authClient} basePath="/handler" redirectTo="/">
    {isAuthRoute ? <AuthHandler /> : <App />}
  </NeonAuthUIProvider>,
);
