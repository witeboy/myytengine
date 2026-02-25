import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, Edit, X, ChevronDown, ChevronUp } from 'lucide-react';

// ── ORIGINAL LIFESTYLE / CONSUMER TEMPLATES ──
const LIFESTYLE_TEMPLATES = [
  {
    id: 'skincare_unbox',
    name: 'Skincare Unboxing',
    emoji: '✨',
    influencerType: 'beauty_guru',
    typeLabel: 'Beauty / Skincare Guru',
    audience: 'Women 18-35 interested in skincare routines',
    demography: 'Urban millennials & Gen Z, middle income',
    market: 'US, UK, Canada',
    action: 'Unboxing a new skincare product, showing texture close-ups, applying to face, genuine reaction to smell and feel, natural lighting in bathroom',
    color: 'from-pink-400 to-rose-500',
  },
  {
    id: 'fitness_routine',
    name: 'Workout Routine',
    emoji: '💪',
    influencerType: 'fitness_coach',
    typeLabel: 'Fitness Coach',
    audience: 'Men & women 20-40 into home fitness',
    demography: 'Health-conscious, active lifestyle',
    market: 'US, Australia, UK',
    action: 'Demonstrating a quick 5-minute morning workout routine, speaking to camera between exercises, energetic and motivating, gym or living room setting',
    color: 'from-orange-400 to-red-500',
  },
  {
    id: 'tech_review',
    name: 'Gadget Review',
    emoji: '📱',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Tech enthusiasts 18-45',
    demography: 'Early adopters, higher income bracket',
    market: 'US, Europe, India',
    action: 'Hands-on review of a new gadget, close-up shots of the product, comparing features, honest pros and cons, desk setup background',
    color: 'from-blue-400 to-cyan-500',
  },
  {
    id: 'recipe_quick',
    name: 'Quick Recipe',
    emoji: '🍳',
    influencerType: 'food_creator',
    typeLabel: 'Food / Recipe Creator',
    audience: 'Home cooks 25-45 looking for fast meals',
    demography: 'Busy professionals, families',
    market: 'US, UK, Canada',
    action: 'Making a 3-ingredient recipe, overhead shots of ingredients, step-by-step cooking, final plating reveal, kitchen setting',
    color: 'from-amber-400 to-orange-500',
  },
  {
    id: 'travel_vlog',
    name: 'Travel Highlight',
    emoji: '✈️',
    influencerType: 'travel',
    typeLabel: 'Travel Content',
    audience: 'Adventure seekers 20-40',
    demography: 'Young professionals, digital nomads',
    market: 'Global, English-speaking',
    action: 'Exploring a scenic destination, walking through streets, trying local food, sunset shot, speaking to camera with excitement',
    color: 'from-teal-400 to-emerald-500',
  },
  {
    id: 'fashion_haul',
    name: 'Fashion Haul',
    emoji: '👗',
    influencerType: 'fashion',
    typeLabel: 'Fashion Influencer',
    audience: 'Fashion-forward women 18-35',
    demography: 'Style-conscious, mid to high income',
    market: 'US, UK, Europe',
    action: 'Try-on haul of new clothing items, mirror shots, outfit transitions, honest opinions on fit and quality, bedroom or closet setting',
    color: 'from-purple-400 to-pink-500',
  },
];

// ── SAAS & BUSINESS SOFTWARE TEMPLATES ──

const SAAS_REVIEWS = [
  {
    id: 'saas_first_impressions',
    name: 'First Impressions Review',
    emoji: '🆕',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'SaaS early adopters, productivity enthusiasts 25-45',
    demography: 'Knowledge workers, freelancers, startup founders',
    market: 'US, UK, Global English',
    action: 'Reacting to a SaaS product for the first time. Face-to-camera intro with product logo visible, screen recording of signup process, reaction shots to features (split screen), walkthrough of dashboard, "wow" moment or disappointment, final verdict to camera. Hooks: "I finally tried [Product] after everyone hyping it up...", "Is this the killer everyone\'s talking about?"',
    color: 'from-blue-500 to-indigo-600',
    duration: '60-90s short / 8-12min long',
    bestFor: 'Project management, productivity apps, new SaaS launches',
  },
  {
    id: 'saas_honest_comparison',
    name: 'Honest Comparison',
    emoji: '⚖️',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Decision-makers comparing SaaS tools 28-50',
    demography: 'Business owners, team leads, IT buyers',
    market: 'US, UK, Europe',
    action: 'Side-by-side comparison of two competing products. Hook: "I spent $X testing both so you don\'t have to". Split-screen feature comparison, real workflow demonstration in each, pricing breakdown with graphics overlay, pros/cons rapid fire, clear winner announcement with reasoning.',
    color: 'from-violet-500 to-purple-600',
    duration: '90s-3min short / 15-20min long',
    bestFor: 'CRM tools, email marketing, project management, design tools',
  },
  {
    id: 'saas_switching_story',
    name: 'Switching Story',
    emoji: '🔄',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Professionals frustrated with current tools 25-45',
    demography: 'Remote workers, small business owners',
    market: 'US, UK, Canada',
    action: 'Why I switched from old tool to new tool. Emotional hook showing frustration with old tool, "the breaking point" story, discovery of new tool, migration process time-lapse, before/after productivity comparison, "life now" satisfaction. Hook: "I finally broke up with [Old Tool]. Here\'s why."',
    color: 'from-cyan-500 to-blue-600',
    duration: '60-90s',
    bestFor: 'CRM migrations, email platforms, project management, accounting',
  },
  {
    id: 'saas_feature_deep_dive',
    name: 'Feature Deep Dive',
    emoji: '🎯',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'Power users and intermediate SaaS users 25-40',
    demography: 'Productivity enthusiasts, process optimizers',
    market: 'US, Europe, Global',
    action: 'Exploring one specific feature in depth. Teaser of the outcome, face-to-camera: "Most people don\'t know this exists", step-by-step screen recording, real example use case, before/after comparison, recap and CTA. Hook: "The hidden feature in [Product] that changed everything"',
    color: 'from-emerald-500 to-teal-600',
    duration: '45-90s',
    bestFor: 'Complex SaaS tools, automation platforms, CRM, analytics',
  },
];

const SAAS_TESTIMONIALS = [
  {
    id: 'saas_roi_testimonial',
    name: 'ROI Testimonial',
    emoji: '💰',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Business owners looking for ROI-driven tools 30-55',
    demography: 'Entrepreneurs, C-suite, growth-focused',
    market: 'US, UK, Global',
    action: 'Real business owner sharing specific results. Attention-grabbing result statement, "before" situation struggle, discovery moment, implementation journey montage, specific metrics/results with text overlay, emotional payoff: "Now I can finally..." Hook: "This tool made me $X in [timeframe]"',
    color: 'from-green-500 to-emerald-600',
    duration: '30-60s',
    bestFor: 'Automation tools, CRM, marketing platforms, e-commerce',
  },
  {
    id: 'saas_problem_solution',
    name: 'Problem-Solution Story',
    emoji: '😤',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Anyone experiencing a specific SaaS pain point 22-45',
    demography: 'Professionals, small teams, freelancers',
    market: 'US, UK, Canada, Australia',
    action: 'Starting with relatable pain point, building frustration, then revealing solution. Cold open: the frustrating moment recreated, stack the pain, rock bottom: "I was ready to quit", discovery, brief solution demo, transformation. Hook: "I was spending 5 hours a day on [task]. Now it takes 10 minutes."',
    color: 'from-red-500 to-orange-600',
    duration: '45-75s',
    bestFor: 'Any SaaS solving a clear pain point',
  },
  {
    id: 'saas_team_transformation',
    name: 'Team Transformation',
    emoji: '🏢',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Team leads and managers 30-50',
    demography: 'Mid-size companies, growing startups',
    market: 'US, UK, Europe',
    action: 'How a team adopted a tool. "Our team was a mess" relatable chaos, decision to try something new, onboarding montage with team shots, real reactions, metric improvements with graphics, team testimonial soundbites. Hook: "Our team went from chaos to clarity in 2 weeks"',
    color: 'from-indigo-500 to-blue-600',
    duration: '60-90s',
    bestFor: 'Collaboration tools, project management, communication, HR',
  },
  {
    id: 'saas_founder_story',
    name: 'Founder Story',
    emoji: '🌟',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Aspiring entrepreneurs and startup founders 25-45',
    demography: 'Bootstrappers, solopreneurs, early-stage founders',
    market: 'US, Global',
    action: 'Startup founder sharing authentic journey with the tool. "When I started, I had nothing", early struggles with authentic b-roll, finding the tool that changed things, growth montage, current success visuals, "If I had to start over, I\'d use this on Day 1". Hook: "Running a business alone is hard. This tool is my co-founder."',
    color: 'from-amber-500 to-yellow-600',
    duration: '60-90s',
    bestFor: 'All-in-one platforms, business banking, CRM, e-commerce',
  },
];

const SAAS_LAUNCHES = [
  {
    id: 'saas_app_launch',
    name: 'App Launch Hype',
    emoji: '🚀',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Early adopters, tech community 20-40',
    demography: 'Product Hunt crowd, tech enthusiasts',
    market: 'US, Global',
    action: 'Building excitement for new product launch. Mysterious teaser: blurred screen with excited reaction, "I can\'t show you everything yet BUT...", one feature preview, genuine excitement reaction, "Mark your calendars" with date, waitlist signup CTA. Hook: "Something big is coming and I got early access..."',
    color: 'from-orange-500 to-red-600',
    duration: '30-45s',
    bestFor: 'New product launches, major feature releases, beta programs',
  },
  {
    id: 'saas_early_access',
    name: 'Early Access Reveal',
    emoji: '🔓',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'SaaS enthusiasts and potential early adopters 25-45',
    demography: 'Tech-forward professionals, beta testers',
    market: 'US, UK, Europe',
    action: 'Exclusive first look before public launch. "I got in before everyone else" energy, unboxing/first login experience, full feature walkthrough, honest first impressions with pros and cons, who this is for vs not for, early bird offer/waitlist CTA. Hook: "I got early access to [Product] — here\'s everything"',
    color: 'from-yellow-500 to-amber-600',
    duration: '3-10min',
    bestFor: 'Beta launches, exclusive programs, premium tools',
  },
  {
    id: 'saas_feature_update',
    name: 'Feature Update',
    emoji: '📢',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Existing SaaS users and potential buyers 25-50',
    demography: 'Current customers, upgrade candidates',
    market: 'US, Global',
    action: 'Announcing a major new feature. Excited hook: "It\'s finally here!", quick context on what was missing before, demo of new feature, real use case example, how this changes workflow, "Update your app NOW". Hook: "[Product] just dropped a MASSIVE update"',
    color: 'from-blue-500 to-cyan-600',
    duration: '45-90s',
    bestFor: 'Existing SaaS products, major releases, feature announcements',
  },
  {
    id: 'saas_special_offer',
    name: 'Special Offer/Deal',
    emoji: '🎁',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Budget-conscious buyers and deal seekers 25-55',
    demography: 'Price-sensitive professionals, small businesses',
    market: 'US, UK, Global',
    action: 'Limited-time promotion with urgency. "Stop scrolling — this won\'t last", quick product value recap, deal details with clear graphics, what you get vs normal price, personal endorsement: "I use this daily", clear CTA with deadline. Hook: "[Product] is doing something crazy right now..."',
    color: 'from-pink-500 to-rose-600',
    duration: '30-45s',
    bestFor: 'SaaS promotions, annual sales, bundle deals',
  },
];

const SAAS_TUTORIALS = [
  {
    id: 'saas_quick_setup',
    name: 'Quick Setup Guide',
    emoji: '⚡',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'New users and beginners 20-50',
    demography: 'Non-technical users, small business owners',
    market: 'US, UK, Global',
    action: 'Getting started in under 5 minutes. "By the end of this, you\'ll be up and running", Step 1: Account creation screen recording, Step 2: Initial settings, Step 3: First project/task, Step 4: Key features to know, "You\'re ready! Go build something." Hook: "Set up [Product] in 5 minutes — complete beginner guide"',
    color: 'from-yellow-400 to-orange-500',
    duration: '3-5min',
    bestFor: 'Any SaaS with learning curve, onboarding content',
  },
  {
    id: 'saas_advanced_workflow',
    name: 'Advanced Workflow',
    emoji: '🔧',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'Power users and advanced professionals 28-50',
    demography: 'Productivity hackers, automation enthusiasts',
    market: 'US, Europe, Global',
    action: 'Power user techniques and efficiency hacks. Impressive result/output teaser, "Here\'s my exact setup...", detailed walkthrough with explanations, integration connections with other tools, automation demonstrations, template/resource offer. Hook: "The [Product] setup that runs my entire business"',
    color: 'from-indigo-400 to-violet-500',
    duration: '8-15min',
    bestFor: 'Automation tools, CRM, project management, complex SaaS',
  },
  {
    id: 'saas_integration_tutorial',
    name: 'Integration Tutorial',
    emoji: '🔗',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'SaaS users looking to connect their stack 25-45',
    demography: 'Tech-savvy professionals, operations managers',
    market: 'US, UK, Global',
    action: 'How to connect two or more tools. "These two tools together = magic", use case explanation, step-by-step connection process, configuration details, live demonstration, troubleshooting tips. Hook: "Connect [Tool A] to [Tool B] in 5 minutes"',
    color: 'from-cyan-400 to-teal-500',
    duration: '5-10min',
    bestFor: 'Zapier, Make, native integrations, API products',
  },
  {
    id: 'saas_troubleshooting',
    name: 'Troubleshooting Guide',
    emoji: '🆘',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'Frustrated users looking for fixes 20-50',
    demography: 'Existing customers, support seekers',
    market: 'US, Global',
    action: 'Solving common problems and error fixes. "If you\'re seeing this error, don\'t panic", explain what causes the issue, step-by-step solution, verification that it\'s fixed, prevention tips, "Still stuck? Try this..." Hook: "Getting [error]? Here\'s the fix."',
    color: 'from-red-400 to-rose-500',
    duration: '2-5min',
    bestFor: 'Complex software, enterprise tools, frequently asked issues',
  },
];

const SAAS_DAYINLIFE = [
  {
    id: 'saas_morning_routine',
    name: 'Morning Routine + Tools',
    emoji: '☀️',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Productivity-focused professionals 25-40',
    demography: 'Remote workers, entrepreneurs, CEOs',
    market: 'US, UK, Global',
    action: 'How creator starts their workday. Wake up shot, morning ritual (coffee, exercise), opening laptop: "First thing I check...", Tool #1 demo quick, Tool #2 demo quick, "Now I\'m ready to work". Hook: "My 6 AM CEO morning routine (tools included)"',
    color: 'from-yellow-400 to-amber-500',
    duration: '60-90s',
    bestFor: 'Productivity apps, email tools, task managers',
  },
  {
    id: 'saas_wfh_setup',
    name: 'Work From Home Setup',
    emoji: '🖥️',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Remote workers and home office builders 25-45',
    demography: 'Tech-savvy professionals, setup enthusiasts',
    market: 'US, UK, Global',
    action: 'Full workspace tour focusing on software and hardware. Wide shot of full setup, hardware tour quick, software stack reveal, "The tool I can\'t live without...", workflow demonstration, total cost breakdown optional. Hook: "My work-from-home setup that makes me $X/month"',
    color: 'from-slate-400 to-gray-600',
    duration: '3-8min',
    bestFor: 'Productivity suites, communication tools, hardware + software',
  },
  {
    id: 'saas_weekly_planning',
    name: 'Weekly Planning Session',
    emoji: '📊',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Organized professionals and planners 25-50',
    demography: 'Managers, freelancers, productivity nerds',
    market: 'US, UK, Global',
    action: 'How creator plans their week using specific tools. "Every Sunday I do this...", review previous week, brain dump into tool, prioritization process, calendar blocking, final weekly view. Hook: "Plan your week in 30 minutes (my exact system)"',
    color: 'from-blue-400 to-indigo-500',
    duration: '5-10min',
    bestFor: 'Task managers, calendar apps, note-taking, planning apps',
  },
  {
    id: 'saas_day_in_life',
    name: 'Day in My Life as [Role]',
    emoji: '🏃',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Professionals curious about role workflows 22-40',
    demography: 'Career explorers, aspiring professionals',
    market: 'US, Global',
    action: 'Following a specific profession showing daily tool usage. "Here\'s what my day actually looks like", morning block tasks + tools, meetings/collaboration, deep work session, afternoon tasks, end of day wrap-up. Hook: "Day in my life as a startup founder (all the tools I use)"',
    color: 'from-teal-400 to-cyan-500',
    duration: '3-10min',
    bestFor: 'Role-specific software, industry tools, productivity stacks',
  },
];

const SAAS_ENTERPRISE = [
  {
    id: 'saas_erp_story',
    name: 'ERP Implementation',
    emoji: '📈',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Operations managers and business leaders 35-60',
    demography: 'Enterprise decision-makers, COOs',
    market: 'US, UK, Europe',
    action: 'Business transformation through ERP adoption. "We were drowning in spreadsheets", decision to implement, implementation journey with challenges and wins, training team montage, results efficiency metrics, advice for others. Hook: "How ERP saved our company from chaos"',
    color: 'from-blue-600 to-indigo-700',
    duration: '3-8min',
    bestFor: 'ERP systems, enterprise software, business management',
  },
  {
    id: 'saas_security',
    name: 'Security/Compliance',
    emoji: '🔐',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'CTOs, security professionals, compliance officers 30-55',
    demography: 'Enterprise security buyers, IT managers',
    market: 'US, UK, Europe',
    action: 'Demonstrating security features and compliance. "Security isn\'t optional anymore", threat landscape context, tool introduction and features, implementation demonstration, compliance checkboxes met, peace of mind conclusion. Hook: "How we passed our SOC 2 audit (tools we used)"',
    color: 'from-gray-600 to-slate-700',
    duration: '5-10min',
    bestFor: 'Security tools, compliance platforms, password managers, VPNs',
  },
  {
    id: 'saas_hr_people',
    name: 'HR/People Management',
    emoji: '👥',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'HR managers, people ops, team leads 30-50',
    demography: 'Growing companies, HR professionals',
    market: 'US, UK, Global',
    action: 'Managing teams, onboarding, performance reviews. HR pain points relatable, old process vs new process, tool walkthrough, employee experience perspective, admin dashboard overview, time/money saved metrics. Hook: "How we onboard new hires in 1 day (not 2 weeks)"',
    color: 'from-emerald-500 to-green-600',
    duration: '5-10min',
    bestFor: 'HRIS, onboarding tools, performance management, payroll',
  },
  {
    id: 'saas_sales_crm',
    name: 'Sales/CRM Success',
    emoji: '💼',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Sales teams, sales managers, revenue leaders 28-50',
    demography: 'B2B sales professionals, startup SDRs',
    market: 'US, UK, Global',
    action: 'How a sales team transformed with CRM. "We were losing deals to disorganization", CRM implementation decision, pipeline setup demonstration, team adoption journey, results: revenue/close rate improvement, top features that made the difference. Hook: "We 3X\'d our sales with this CRM setup"',
    color: 'from-violet-500 to-purple-600',
    duration: '5-10min',
    bestFor: 'CRM platforms, sales tools, pipeline management',
  },
];

const SAAS_MARKETING = [
  {
    id: 'saas_email_marketing',
    name: 'Email Marketing Setup',
    emoji: '📧',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'Marketers and business owners 25-50',
    demography: 'Digital marketers, e-commerce owners',
    market: 'US, UK, Global',
    action: 'Creating email campaigns and automation. "Email is still the highest ROI channel", platform overview, campaign creation walkthrough, automation setup, results/analytics review, key metrics to track. Hook: "The email sequence that makes me $X/month on autopilot"',
    color: 'from-blue-500 to-indigo-600',
    duration: '8-15min',
    bestFor: 'Email marketing platforms, automation tools, newsletters',
  },
  {
    id: 'saas_social_media',
    name: 'Social Media Management',
    emoji: '📱',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Social media managers and creators 22-40',
    demography: 'Content creators, marketing teams',
    market: 'US, UK, Global',
    action: 'Scheduling, analytics, content management. "Social media was eating my life", tool introduction, content calendar setup, scheduling demonstration, analytics overview, weekly time savings. Hook: "How I manage 5 social accounts in 30 min/day"',
    color: 'from-pink-500 to-purple-600',
    duration: '5-10min',
    bestFor: 'Social media schedulers, analytics tools, content planners',
  },
  {
    id: 'saas_ads_campaign',
    name: 'Ads/Campaign Management',
    emoji: '🎯',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'PPC managers and growth marketers 25-50',
    demography: 'Performance marketers, e-commerce brands',
    market: 'US, UK, Global',
    action: 'Setting up paid campaigns and optimizing spend. Results teaser (ROAS, revenue), strategy overview, campaign setup walkthrough, targeting demonstration, optimization process, scaling tactics. Hook: "How I turned $1K into $10K with this ads setup"',
    color: 'from-orange-500 to-red-600',
    duration: '10-20min',
    bestFor: 'Ads management, attribution tools, analytics platforms',
  },
  {
    id: 'saas_seo_content',
    name: 'SEO/Content Tools',
    emoji: '🔍',
    influencerType: 'education',
    typeLabel: 'Education / How-to',
    audience: 'Content marketers and SEO professionals 25-45',
    demography: 'Bloggers, content teams, SEO agencies',
    market: 'US, UK, Global',
    action: 'Keyword research and content optimization. Results: ranking/traffic screenshot, tool introduction, keyword research process, content optimization demo, tracking progress, results timeline. Hook: "How I ranked #1 for [keyword] in 30 days"',
    color: 'from-green-500 to-emerald-600',
    duration: '8-15min',
    bestFor: 'SEO tools, content platforms, keyword research',
  },
];

const SAAS_CREATIVE = [
  {
    id: 'saas_design_tool',
    name: 'Design Tool Showcase',
    emoji: '🎨',
    influencerType: 'fashion',
    typeLabel: 'Fashion Influencer',
    audience: 'Non-designers and creative professionals 20-45',
    demography: 'Small business owners, content creators',
    market: 'US, UK, Global',
    action: 'Creating graphics and brand assets. Finished design reveal, "Here\'s how I made it", tool interface overview, step-by-step creation, export and use demonstration, before/after comparison. Hook: "I made this in 5 minutes (no design skills)"',
    color: 'from-pink-400 to-purple-500',
    duration: '3-8min',
    bestFor: 'Design tools, presentation software, brand asset creators',
  },
  {
    id: 'saas_video_editing',
    name: 'Video Editing Tool',
    emoji: '🎬',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Content creators and video editors 20-40',
    demography: 'YouTubers, social media creators, freelancers',
    market: 'US, UK, Global',
    action: 'Editing workflow and efficiency tips. Final video clip teaser, raw footage starting point, editing process speed-ramped, key features demonstration, export settings, time comparison vs alternatives. Hook: "The editing tool that cut my time in half"',
    color: 'from-red-500 to-pink-600',
    duration: '5-15min',
    bestFor: 'Video editors, effect tools, AI video tools',
  },
  {
    id: 'saas_ai_tool',
    name: 'AI Tool Demo',
    emoji: '🤖',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'AI-curious professionals and creators 22-45',
    demography: 'Early adopters, tech enthusiasts',
    market: 'US, Global',
    action: 'Demonstrating AI capabilities and practical applications. Challenge setup, AI tool introduction, input/prompt demonstration, real-time generation, results evaluation honest, when to use vs not use. Hook: "The AI tool that\'s actually useful (not just hype)"',
    color: 'from-violet-500 to-indigo-600',
    duration: '3-10min',
    bestFor: 'AI writing, AI design, AI coding, AI productivity tools',
  },
];

const SAAS_FINANCE = [
  {
    id: 'saas_accounting',
    name: 'Accounting/Invoicing',
    emoji: '💵',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Small business owners and freelancers 25-55',
    demography: 'Self-employed, solopreneurs, agencies',
    market: 'US, UK, Canada',
    action: 'Managing finances and invoicing clients. "I used to dread finances", tool overview, invoice creation demo, expense tracking setup, report generation, tax preparation features. Hook: "How I manage 6-figure finances without an accountant"',
    color: 'from-green-500 to-teal-600',
    duration: '5-10min',
    bestFor: 'Accounting software, invoicing tools, expense trackers',
  },
  {
    id: 'saas_inventory',
    name: 'Inventory/Operations',
    emoji: '📦',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'E-commerce operators and warehouse managers 28-55',
    demography: 'Product-based businesses, supply chain',
    market: 'US, UK, Global',
    action: 'Managing stock, orders, supply chain. Warehouse/product context, previous chaos/problems, tool implementation, daily workflow demonstration, reporting capabilities, cost/time savings. Hook: "How I track 500+ SKUs without losing my mind"',
    color: 'from-amber-500 to-orange-600',
    duration: '5-10min',
    bestFor: 'Inventory management, order management, supply chain tools',
  },
  {
    id: 'saas_business_banking',
    name: 'Business Banking',
    emoji: '🏦',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Startup founders and small business owners 25-50',
    demography: 'Fintech-forward entrepreneurs',
    market: 'US, UK',
    action: 'Modern banking features and integrations. Pain points with traditional banks, discovery of new solution, account setup/features, integration capabilities, fee comparison, daily usage demonstration. Hook: "Why I switched business banks (and what I use now)"',
    color: 'from-blue-600 to-indigo-700',
    duration: '5-8min',
    bestFor: 'Neobanks, business banking, fintech tools',
  },
];

const SAAS_TESTIMONIAL_VARIATIONS = [
  {
    id: 'saas_quick_soundbite',
    name: 'Quick Soundbite',
    emoji: '🎤',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Quick-scrolling social media audience 18-45',
    demography: 'Broad consumer base, ad targets',
    market: 'US, Global',
    action: '15-30 second punchy testimonial. Attention grab (2 sec), one key benefit (5 sec), brief proof point (5 sec), emotional payoff (5 sec), recommendation (3 sec). Hook: "One tool. Changed everything." or "I was skeptical. Now I\'m obsessed."',
    color: 'from-rose-500 to-red-600',
    duration: '15-30s',
    bestFor: 'Ad creative, social proof, landing pages',
  },
  {
    id: 'saas_talking_head',
    name: 'Talking Head Testimonial',
    emoji: '📹',
    influencerType: 'lifestyle',
    typeLabel: 'Lifestyle / Vlogger',
    audience: 'Website visitors and potential buyers 25-55',
    demography: 'Decision-stage prospects',
    market: 'US, UK, Global',
    action: 'Direct-to-camera sincere testimonial. Introduction (who I am, context), problem I was facing, discovery and skepticism, experience using the product, specific results/benefits, recommendation and for whom. Hook: "I\'ve used a lot of tools. This one\'s different."',
    color: 'from-blue-400 to-cyan-500',
    duration: '60-120s',
    bestFor: 'Website testimonials, case studies, sales pages',
  },
  {
    id: 'saas_screen_face_split',
    name: 'Screen + Face Split',
    emoji: '🖥️',
    influencerType: 'tech_reviewer',
    typeLabel: 'Tech Reviewer',
    audience: 'Technical buyers wanting to see the product 25-50',
    demography: 'Evaluators, comparison shoppers',
    market: 'US, UK, Global',
    action: 'Split screen showing product and reaction simultaneously. Setup explanation, live demonstration with commentary, real reactions captured, key moment highlights, summary thoughts. Hook: "Watch my reaction as I try [feature]"',
    color: 'from-purple-400 to-violet-500',
    duration: '60-180s',
    bestFor: 'Feature demonstrations, live reviews, reaction content',
  },
  {
    id: 'saas_results_showcase',
    name: 'Results Showcase',
    emoji: '🏆',
    influencerType: 'business',
    typeLabel: 'Business / Finance',
    audience: 'Data-driven buyers and business leaders 30-55',
    demography: 'ROI-focused decision-makers',
    market: 'US, UK, Global',
    action: 'Data-heavy testimonial with specific metrics. Headline result (big number), context: starting point, implementation process, data visualization (charts, dashboards), what this means in real terms, advice for achieving similar results. Hook: "The numbers don\'t lie: [specific result]"',
    color: 'from-emerald-500 to-green-600',
    duration: '60-90s',
    bestFor: 'Performance tools, marketing platforms, analytics software',
  },
];

const SAAS_CATEGORIES = [
  { label: 'Product Reviews & First Impressions', templates: SAAS_REVIEWS },
  { label: 'Testimonials & Success Stories', templates: SAAS_TESTIMONIALS },
  { label: 'Product Launches & Announcements', templates: SAAS_LAUNCHES },
  { label: 'Tutorials & How-To', templates: SAAS_TUTORIALS },
  { label: 'Day-in-the-Life & Workflow', templates: SAAS_DAYINLIFE },
  { label: 'Enterprise & B2B', templates: SAAS_ENTERPRISE },
  { label: 'Marketing & Growth', templates: SAAS_MARKETING },
  { label: 'Creative & Design', templates: SAAS_CREATIVE },
  { label: 'Finance & Operations', templates: SAAS_FINANCE },
  { label: 'Testimonial Variations', templates: SAAS_TESTIMONIAL_VARIATIONS },
];

export default function UGCTemplates({ onSelectTemplate }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [showSaaS, setShowSaaS] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);

  const handleEdit = (t) => {
    setEditing(t.id);
    setEditData({ ...t });
  };

  const handleApply = () => {
    onSelectTemplate(editData);
    setEditing(null);
  };

  const renderTemplateCard = (t) => (
    <Card key={t.id} className="group hover:shadow-md transition-all cursor-pointer overflow-hidden" onClick={() => onSelectTemplate(t)}>
      <div className={`h-1.5 bg-gradient-to-r ${t.color}`} />
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{t.emoji}</span>
          <p className="text-xs font-semibold">{t.name}</p>
        </div>
        <p className="text-[10px] text-gray-500 mb-2 line-clamp-2">{t.action}</p>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-[9px]">{t.typeLabel}</Badge>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); handleEdit(t); }}>
            <Edit className="w-3 h-3" />
          </Button>
        </div>
        {t.duration && <p className="text-[8px] text-gray-400 mt-1">{t.duration}</p>}
      </CardContent>
    </Card>
  );

  if (editing) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-600">Quick Start Templates</h3>
        <Card className="border-pink-300">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Customize: {editData.name}</p>
              <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="w-4 h-4" /></Button>
            </div>
            <Input value={editData.audience} onChange={e => setEditData(d => ({ ...d, audience: e.target.value }))} placeholder="Target audience" />
            <Input value={editData.demography} onChange={e => setEditData(d => ({ ...d, demography: e.target.value }))} placeholder="Demography" />
            <Input value={editData.market} onChange={e => setEditData(d => ({ ...d, market: e.target.value }))} placeholder="Market" />
            <Textarea value={editData.action} onChange={e => setEditData(d => ({ ...d, action: e.target.value }))} placeholder="What the influencer does..." className="min-h-[80px]" />
            <Button onClick={handleApply} className="w-full bg-pink-600 hover:bg-pink-700 gap-2">
              Use Template <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-600">Quick Start Templates</h3>

      {/* Lifestyle / Consumer */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LIFESTYLE_TEMPLATES.map(renderTemplateCard)}
      </div>

      {/* SaaS / Business Toggle */}
      <button
        onClick={() => setShowSaaS(!showSaaS)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-2 border-dashed border-indigo-300 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 transition-all text-sm font-medium text-indigo-600"
      >
        <span>💼</span>
        SaaS & Business Software Templates ({SAAS_CATEGORIES.reduce((a, c) => a + c.templates.length, 0)})
        {showSaaS ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showSaaS && (
        <div className="space-y-3">
          {SAAS_CATEGORIES.map((cat, ci) => (
            <div key={ci} className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCategory(expandedCategory === ci ? null : ci)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="text-xs font-semibold text-gray-700">{cat.label} <span className="text-gray-400">({cat.templates.length})</span></span>
                {expandedCategory === ci ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>
              {expandedCategory === ci && (
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {cat.templates.map(renderTemplateCard)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}