import React from 'react';
import ReactDOM from 'react-dom/client';
import { NeonAuthUIProvider } from '@neondatabase/auth-ui';
import '@neondatabase/auth-ui/css';
import App from '@/App.jsx';
import AuthHandler from '@/lib/AuthHandler';
import { authClient } from '@/lib/neon-auth';
import '@/index.css';

const isAuthRoute = /^\/handler(?:\/|$)/.test(window.location.pathname);

// `social` has no default in @neondatabase/auth-ui: with the prop absent the sign-in
// view renders email/password only, which is why no Google button appeared. Google is
// configured on the Neon Auth branch as a shared provider.
ReactDOM.createRoot(document.getElementById('root')).render(
  <NeonAuthUIProvider
    authClient={authClient}
    basePath="/handler"
    redirectTo="/"
    social={{ providers: ['google'] }}
  >
    {isAuthRoute ? <AuthHandler /> : <App />}
  </NeonAuthUIProvider>,
);
