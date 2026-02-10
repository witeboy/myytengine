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
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import HookSelection from './pages/HookSelection';
import NewProject from './pages/NewProject';
import ProductionStudio from './pages/ProductionStudio';
import PublishCenter from './pages/PublishCenter';
import ScriptBatching from './pages/ScriptBatching';
import ScriptWorkshop from './pages/ScriptWorkshop';
import TopicSelection from './pages/TopicSelection';
import VideoDurationSetup from './pages/VideoDurationSetup';
import hookSelection from './pages/hook_selection';
import productionStudio from './pages/production_studio';
import publishCenter from './pages/publish_center';
import scriptWorkshop from './pages/script_workshop';
import topicSelection from './pages/topic_selection';


export const PAGES = {
    "Dashboard": Dashboard,
    "Home": Home,
    "HookSelection": HookSelection,
    "NewProject": NewProject,
    "ProductionStudio": ProductionStudio,
    "PublishCenter": PublishCenter,
    "ScriptBatching": ScriptBatching,
    "ScriptWorkshop": ScriptWorkshop,
    "TopicSelection": TopicSelection,
    "VideoDurationSetup": VideoDurationSetup,
    "hook_selection": hookSelection,
    "production_studio": productionStudio,
    "publish_center": publishCenter,
    "script_workshop": scriptWorkshop,
    "topic_selection": topicSelection,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
};