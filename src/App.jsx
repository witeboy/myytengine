import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import BulkUGCPipeline from './pages/BulkUGCPipeline';
import LongViralPipeline from './pages/LongViralPipeline';
import ShortsPipeline from './pages/ShortsPipeline';
import AutoEditReview from './pages/AutoEditReview';
import YouTubeCallback from './pages/YouTubeCallback';
import QuickPublish from './pages/QuickPublish';
import ClipExtractor from './pages/ClipExtractor';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;
const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/BulkUGCPipeline" element={
        <LayoutWrapper currentPageName="BulkUGCPipeline">
          <BulkUGCPipeline />
        </LayoutWrapper>
      } />
      <Route path="/LongViralPipeline" element={
        <LayoutWrapper currentPageName="LongViralPipeline">
          <LongViralPipeline />
        </LayoutWrapper>
      } />
      <Route path="/ShortsPipeline" element={
        <LayoutWrapper currentPageName="ShortsPipeline">
          <ShortsPipeline />
        </LayoutWrapper>
      } />
      <Route path="/AutoEditReview" element={
        <LayoutWrapper currentPageName="AutoEditReview">
          <AutoEditReview />
        </LayoutWrapper>
      } />
      <Route path="/YouTubeCallback" element={<YouTubeCallback />} />
      <Route path="/QuickPublish" element={
        <LayoutWrapper currentPageName="QuickPublish">
          <QuickPublish />
        </LayoutWrapper>
      } />
      <Route path="/ClipExtractor" element={
        <LayoutWrapper currentPageName="ClipExtractor">
          <ClipExtractor />
        </LayoutWrapper>
      } />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
