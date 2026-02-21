/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import ContentGeneration from './pages/ContentGeneration';
import ContentRepurpose from './pages/ContentRepurpose';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import MediaLibrary from './pages/MediaLibrary';
import NewProject from './pages/NewProject';
import PostProduction from './pages/PostProduction';
import StoryDuration from './pages/StoryDuration';
import StoryHooks from './pages/StoryHooks';
import StoryScript from './pages/StoryScript';
import StoryTopics from './pages/StoryTopics';
import TimelineEditor from './pages/TimelineEditor';
import UGCPipeline from './pages/UGCPipeline';
import VersionHistory from './pages/VersionHistory';
import ResearchTerminal from './pages/ResearchTerminal';
import ResultsGrid from './pages/ResultsGrid';
import __Layout from './Layout.jsx';


export const PAGES = {
    "ContentGeneration": ContentGeneration,
    "ContentRepurpose": ContentRepurpose,
    "Dashboard": Dashboard,
    "Home": Home,
    "MediaLibrary": MediaLibrary,
    "NewProject": NewProject,
    "PostProduction": PostProduction,
    "StoryDuration": StoryDuration,
    "StoryHooks": StoryHooks,
    "StoryScript": StoryScript,
    "StoryTopics": StoryTopics,
    "TimelineEditor": TimelineEditor,
    "UGCPipeline": UGCPipeline,
    "VersionHistory": VersionHistory,
    "ResearchTerminal": ResearchTerminal,
    "ResultsGrid": ResultsGrid,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};