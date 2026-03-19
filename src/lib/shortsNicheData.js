// ═══════════════════════════════════════════════════════════════
// SHORTS NICHE STRUCTURES — 90-SECOND BLUEPRINT
// Exact second-by-second, word-by-word production specs.
// ═══════════════════════════════════════════════════════════════

export const SHORTS_NICHES = {
  finance: {
    id: 'finance',
    title: 'FINANCE / WEALTH SHORT',
    emoji: '💰',
    color: '#22c55e',
    duration: '90 seconds',
    wordCount: '200–240 words',
    pacing: '~2.7 words/sec (conversational urgency)',
    rpm: '$15-30 RPM',
    sections: [
      {
        id: 'hook',
        label: 'HOOK',
        time: '0:00 – 0:05',
        seconds: 5,
        words: '12–18 words',
        color: '#dc2626',
        purpose: 'Pattern interrupt. Stop the scroll. Create an information gap.',
        rules: [
          'First frame = bold text on screen + voice hits simultaneously',
          "NO intro, NO logo, NO 'hey guys'",
          "Must contain a number, a contradiction, or a 'you' statement",
          'Visual: dramatic zoom-in or kinetic text animation',
        ],
        templates: [
          '"A millionaire told me something about money that broke my brain."',
          '"You\'re losing $347 every single month and you don\'t even know it."',
          '"Rich people never buy these 5 things. And it\'s not what you think."',
          '"Warren Buffett\'s #1 rule about money sounds wrong — until you do the math."',
          '"Stop saving money. No, seriously. Here\'s why."',
        ],
        visualSpec: 'Full-screen kinetic text (white on dark or gold on black). Text animates word-by-word synced to voiceover. Subtle camera push-in on background image (money, cityscape, or abstract wealth imagery).',
        audioSpec: 'Voice: confident, slightly fast, NO warmup tone. Background: low tension drone or subtle bass hit on first word.',
      },
      {
        id: 'tension',
        label: 'TENSION / PROBLEM',
        time: '0:05 – 0:20',
        seconds: 15,
        words: '35–45 words',
        color: '#f59e0b',
        purpose: 'Establish the pain point. Make the viewer feel the problem PERSONALLY.',
        rules: [
          "Use 'you' language — make it about THEIR wallet",
          'Include a specific number or statistic (real or derived)',
          'Create urgency: this is costing them RIGHT NOW',
          'Visual changes every 2-3 seconds (new clip, zoom, or text overlay)',
        ],
        templates: [
          '"Most people work 40 years, save into a 401k, and still retire broke. The average American has $65,000 saved at 60. That\'s not retirement — that\'s survival."',
          '"You\'ve been told to cut the lattes and budget harder. But the top 1% don\'t budget at all. They do something completely different with every dollar."',
          '"Inflation is eating 3-4% of your savings every single year. That $10,000 in your bank? It\'ll buy $7,400 worth of stuff in 5 years. Your money is dying while you watch."',
        ],
        visualSpec: 'Stock footage montage: stressed person at desk → bills/receipts → declining graph animation → empty wallet moment. Each clip 2-3 seconds. Captions: bold white with red highlight on key numbers.',
        audioSpec: 'Voice: slightly lower energy, concerned tone. Background: tension builds subtly — add a light rhythmic pulse under narration.',
      },
      {
        id: 'pivot',
        label: 'PIVOT / REVEAL',
        time: '0:20 – 0:25',
        seconds: 5,
        words: '12–16 words',
        color: '#8b5cf6',
        purpose: "The 'BUT' moment. Flip the script. This is where retention spikes or dies.",
        rules: [
          'Single sentence that reverses everything',
          'Must feel like a secret being unlocked',
          'Visual: dramatic transition (flash, color shift, or zoom)',
          'This is the MOST important transition in the entire video',
        ],
        templates: [
          '"But here\'s what the top 1% figured out that changes everything."',
          '"Until I learned this one framework that flipped my entire financial life."',
          '"But there\'s a loophole most people will never discover."',
        ],
        visualSpec: 'HARD CUT or flash transition. Background shifts from dark/red tones to brighter gold/green. Text: single bold line centered on screen. Optional: brief particle/light effect.',
        audioSpec: "Voice: energy shifts UP — confident, slightly faster. Background: beat drop or subtle 'reveal' sound effect (chime, whoosh).",
      },
      {
        id: 'value',
        label: 'VALUE DELIVERY',
        time: '0:25 – 1:10',
        seconds: 45,
        words: '100–130 words',
        color: '#22c55e',
        purpose: 'The meat. Deliver 3 concrete points, rules, or steps. This is why they stay.',
        rules: [
          'Exactly 3 points — not 2, not 5. Three.',
          'Each point: 1 sentence setup + 1 sentence proof/example',
          "Use 'First... Second... Third...' or 'Rule #1... Rule #2... Rule #3...'",
          'Each point gets its own visual segment (15 sec each)',
          'Include at least ONE specific number per point',
          'New visual every 2-3 seconds within each point',
        ],
        templates: [
          '"Rule #1: Pay yourself first. Before rent, before food, before anything — move 20% into investments automatically. Millionaires don\'t save what\'s left after spending. They spend what\'s left after saving.\n\nRule #2: Buy assets, not liabilities. Your car loses 20% the moment you drive it off the lot. That same money in an index fund doubles every 7 years. Rich people buy things that make money.\n\nRule #3: Use debt as a tool. The wealthy borrow at 4% to invest at 10%. While you\'re paying off credit cards, they\'re leveraging cheap money to build more wealth."',
        ],
        visualSpec: "3-segment structure with visual marker for each rule:\n• Rule 1: Animated graph showing compound growth + person investing on phone\n• Rule 2: Side-by-side comparison visual (depreciating car vs. growing portfolio)\n• Rule 3: Visual of leverage/debt concept — house, business, investment\nText overlay: Rule number appears as bold header at start of each segment. Key numbers highlighted in green/gold.",
        audioSpec: 'Voice: teaching mode — confident, measured, authoritative. Energy builds with each rule. Background: light motivational undertone, volume rises slightly per rule.',
      },
      {
        id: 'cta',
        label: 'CTA / LOOP TRIGGER',
        time: '1:10 – 1:25',
        seconds: 15,
        words: '30–40 words',
        color: '#06b6d4',
        purpose: 'Drive action AND set up the rewatch. The last 15 seconds determine if it goes viral.',
        rules: [
          'Callback to the hook — close the loop',
          "Include a 'save this' or 'share this' trigger",
          'Tease the NEXT video if part of a series',
          'End with a question or provocative statement (drives comments)',
          "Do NOT say 'like and subscribe' — say something viewers actually WANT to do",
        ],
        templates: [
          '"That millionaire\'s rule? It was simple: never work for money. Make money work for you. Start with rule #1 today — automate 20% before you even see your paycheck. Save this before you forget it. And if you want the 4th rule that nobody talks about... it\'s in part 2."',
          '"The difference between broke and wealthy isn\'t income. It\'s these 3 rules. Screenshot this. Send it to someone who needs it. Which rule are you starting with? Comment below."',
        ],
        visualSpec: 'Return to hook-style visual treatment. Gold/green accent colors. Final frame: clean text card with key takeaway + channel branding (small, bottom corner). Last 2 seconds: slightly slower text to let it land.',
        audioSpec: 'Voice: warm but authoritative wrap-up. Slightly slower pace on final sentence. Background: resolves — music lands on satisfying note.',
      },
      {
        id: 'deadzone',
        label: 'DEAD ZONE (CUT THIS)',
        time: '1:25 – 1:30',
        seconds: 5,
        words: '0',
        color: '#525252',
        purpose: 'Buffer. Most viewers are gone. Use ONLY for end card or silent branding.',
        rules: [
          'Ideally your content ENDS at 1:20–1:25',
          'These last 5 seconds should be near-silent',
          'Simple channel name/logo card',
          'OR loop back to the hook visually (drives replays)',
        ],
        templates: [],
        visualSpec: 'Simple dark card with channel logo. OR: seamless visual loop back to the opening frame (this tricks the algorithm into counting replays).',
        audioSpec: 'Music fades. Silence or very quiet ambient. No voiceover.',
      },
    ],
  },
  book: {
    id: 'book',
    title: 'BOOK SUMMARY SHORT',
    emoji: '📚',
    color: '#8b5cf6',
    duration: '90 seconds',
    wordCount: '200–240 words',
    pacing: '~2.7 words/sec (story-driven flow)',
    rpm: '$8-15 RPM',
    sections: [
      {
        id: 'hook',
        label: 'HOOK',
        time: '0:00 – 0:05',
        seconds: 5,
        words: '12–18 words',
        color: '#dc2626',
        purpose: 'Make the viewer NEED to know what the book says. Sell the transformation.',
        rules: [
          'Lead with the RESULT the book delivers, not the book title',
          'The book title comes SECOND — the promise comes FIRST',
          'Use a number or a bold claim',
          'Visual: book cover with cinematic zoom + bold text overlay',
        ],
        templates: [
          '"One book changed how 10 million people think about habits. Here\'s the secret in 90 seconds."',
          '"A psychologist discovered why 95% of people fail at everything. He put it in one book."',
          '"This book made me stop wasting 4 hours every single day. It\'s not what you think."',
          '"In 1937, a man interviewed 500 millionaires. What he found will rewire your brain."',
          '"Read this book or stay broke forever. No, I\'m not exaggerating."',
        ],
        visualSpec: 'Book cover: 3D rendered floating against dark background with dramatic lighting. Cinematic slow zoom. Title text animates in bold, word-by-word. Motion blur transition at end of hook.',
        audioSpec: 'Voice: confident, intriguing, story-opener energy. Background: cinematic low drone, single bass note.',
      },
      {
        id: 'context',
        label: 'BOOK CONTEXT',
        time: '0:05 – 0:15',
        seconds: 10,
        words: '25–30 words',
        color: '#f59e0b',
        purpose: 'Establish credibility. WHY should anyone care about this book?',
        rules: [
          'Author name + one credibility marker (sold X copies, studied Y years, etc.)',
          'One sentence on the CORE PROBLEM the book solves',
          "Keep it tight — this is setup, not the main course",
          'Visual: author image (if available) or book-related imagery',
        ],
        templates: [
          '"Atomic Habits by James Clear has sold over 15 million copies. It answers one question: why do small habits create massive results?"',
          '"Robert Kiyosaki wrote Rich Dad Poor Dad in 1997. It\'s been #1 in personal finance for 25 years. The core idea is painfully simple."',
          '"Psychologist Daniel Kahneman spent 40 years studying how your brain tricks you into terrible decisions. He put everything in Thinking, Fast and Slow."',
        ],
        visualSpec: 'Author photo or silhouette with name text. Book cover thumbnail in corner. Sales number or credibility stat animated on screen. Quick transition to next section.',
        audioSpec: 'Voice: informational, authoritative. Slightly lower energy than hook — building foundation. Background: subtle continuation of intro tone.',
      },
      {
        id: 'lessons',
        label: '3 KEY LESSONS',
        time: '0:15 – 1:05',
        seconds: 50,
        words: '120–145 words',
        color: '#22c55e',
        purpose: "The value bomb. Three lessons that make the viewer feel like they 'read' the book.",
        rules: [
          "Exactly 3 lessons — labeled 'Lesson 1, 2, 3' or 'Key Idea 1, 2, 3'",
          'Each lesson: ~16 seconds, ~40-48 words',
          'Structure per lesson: Concept (1 sentence) → Example/Proof (1–2 sentences)',
          'Make each lesson ACTIONABLE — the viewer should be able to DO something',
          'New visual every 2-3 seconds within each lesson',
          'Each lesson feels complete on its own (some viewers only catch one)',
        ],
        templates: [
          '"Lesson 1: The 1% Rule. Don\'t try to be 100% better. Just be 1% better every day. In one year, that compounds to being 37 times better. Small wins stack into transformations nobody sees coming.\n\nLesson 2: Environment beats motivation. You don\'t need more willpower — you need fewer temptations. Put the fruit on the counter and hide the cookies. Design your space so the right choice is the easy choice.\n\nLesson 3: Never miss twice. Missing one workout doesn\'t ruin you. Missing two in a row creates a new habit — quitting. The rule is simple: bad days happen, but never let one bad day become two."',
        ],
        visualSpec: "3 distinct visual segments, each clearly marked:\n• Lesson 1: Number '01' appears large, then concept visualization (growth graph, stacking blocks, compound curve animation)\n• Lesson 2: Environment visual (kitchen counter demo, workspace redesign, before/after room layout)\n• Lesson 3: Calendar visualization showing streak, X marks, recovery pattern\nEach lesson begins with a bold lesson number transition. Captions highlight key phrases in accent color.",
        audioSpec: 'Voice: teaching energy — warm, clear, conversational. Each lesson starts with slightly higher energy. Background: light positive undertone, builds gently across all three lessons.',
      },
      {
        id: 'transformation',
        label: 'TRANSFORMATION STATEMENT',
        time: '1:05 – 1:15',
        seconds: 10,
        words: '25–30 words',
        color: '#8b5cf6',
        purpose: "Tie the 3 lessons together into one powerful sentence. The 'so what' moment.",
        rules: [
          'One sentence that synthesizes ALL three lessons into a life change',
          'This should feel like a revelation — not a summary',
          "Use contrast: 'before this book vs. after this book'",
          'This is the most SHAREABLE moment — design it for screenshots',
        ],
        templates: [
          '"The real lesson? You don\'t need a massive overhaul. You need tiny systems, a better environment, and the discipline to never quit twice. That\'s the entire book in 10 seconds."',
          '"Here\'s what Rich Dad Poor Dad really teaches: the rich don\'t work for money, they build systems that generate money while they sleep. Everything else is commentary."',
          '"Kahneman\'s biggest insight: your gut feeling is wrong about 40% of the time. And you\'ll never know which 40% — unless you build systems to check yourself."',
        ],
        visualSpec: 'Clean, powerful visual moment. Dark background, single bold quote-style text centered on screen. Slight glow effect. This frame should work as a SCREENSHOT — design it for sharing.',
        audioSpec: "Voice: slower, deliberate, weight on every word. This is the 'mic drop' moment. Background: music swells slightly, then resolves.",
      },
      {
        id: 'cta',
        label: 'CTA / SERIES HOOK',
        time: '1:15 – 1:25',
        seconds: 10,
        words: '20–28 words',
        color: '#06b6d4',
        purpose: 'Drive saves, shares, and set up the next video.',
        rules: [
          'Tell them what to DO with this information',
          'Tease the next book summary (series mechanics)',
          "Use 'save this' language — saves are the #1 algorithm signal for Shorts",
          "'Follow for Part 2' or 'Follow for next book' drives subscriptions",
          'End with a question to drive comments',
        ],
        templates: [
          '"Save this so you don\'t forget these 3 rules. Next week: The Psychology of Money — the book that explains why smart people make dumb financial decisions. Follow so you don\'t miss it. Which lesson hit hardest? Comment below."',
          '"That\'s Atomic Habits in 90 seconds. Save it. Share it with someone who\'s stuck. Follow for the next book breakdown — it\'s the one billionaires won\'t shut up about."',
        ],
        visualSpec: "Book cover returns with 'Save This' animated text. Teaser: next book cover fades in with '?' or 'Coming Next' overlay. Final card: clean channel branding, small and tasteful.",
        audioSpec: 'Voice: warm, direct, personal. Feels like a friend recommending something. Background: music resolves cleanly.',
      },
      {
        id: 'loop',
        label: 'LOOP / END',
        time: '1:25 – 1:30',
        seconds: 5,
        words: '0',
        color: '#525252',
        purpose: 'Silent loop-back for replay counting.',
        rules: [
          'Visual loops back toward opening frame',
          'OR simple dark card with channel name',
          'No voiceover needed',
          'Seamless loop = algorithm replay boost',
        ],
        templates: [],
        visualSpec: 'Quick fade to the book cover from the opening shot — creates visual loop. Or: dark branded end card.',
        audioSpec: 'Music fades to silence over 2-3 seconds.',
      },
    ],
  },
};

export const SCRIPT_EXAMPLES = {
  finance: {
    title: '3 Money Rules Rich People Follow (That You Don\'t)',
    wordCount: '228 words',
    script: `[0:00-0:05] HOOK
"You're following money advice designed to keep you poor. Here are 3 rules the wealthy actually use."

[0:05-0:20] TENSION
"Your parents said save money, get a stable job, pay off your house. But the top 1% do the exact opposite. They don't save — they invest. They don't seek security — they seek cash flow. And their house? It's not even their money paying for it."

[0:20-0:25] PIVOT
"Here are the 3 rules they follow that nobody teaches in school."

[0:25-0:40] RULE 1
"Rule one: the 70/30 split. Live on 70% of your income. No exceptions. Put 15% into index funds, 10% into learning new skills, and 5% into high-risk bets. This isn't budgeting. This is wealth architecture."

[0:40-0:55] RULE 2
"Rule two: buy your time back. Rich people don't mow lawns or clean houses. They pay $30 an hour for tasks so they can earn $300 an hour on high-value work. Every dollar spent buying time is an investment."

[0:55-1:10] RULE 3
"Rule three: build once, get paid forever. A YouTube channel. A digital product. A rental property. Create something ONCE that pays you every single month. Wealthy people don't trade time for money — they build machines."

[1:10-1:25] CTA
"That's the playbook. Save this video right now. Start with rule one today — 70/30 your next paycheck. Follow for part two: the investment strategy nobody talks about. Which rule are you starting with?"

[1:25-1:30] END
[Loop back to opening visual]`,
  },
  book: {
    title: 'Atomic Habits in 90 Seconds (3 Life-Changing Ideas)',
    wordCount: '236 words',
    script: `[0:00-0:05] HOOK
"This one book destroyed every excuse I had for not changing my life. 90 seconds. 3 ideas. Let's go."

[0:05-0:15] CONTEXT
"Atomic Habits by James Clear sold over 15 million copies. It's not about motivation or willpower. It's about systems — and why tiny changes create ridiculous results."

[0:15-0:32] LESSON 1
"Lesson one: forget goals. Build systems instead. Goals are what you want. Systems are what you actually do every day. A goal is 'lose 20 pounds.' A system is 'I eat protein with every meal and walk 10 minutes after lunch.' One is a wish. The other is a machine."

[0:32-0:48] LESSON 2
"Lesson two: make it stupid easy. Want to read more? Put a book on your pillow. Want to work out? Sleep in your gym clothes. James Clear calls this reducing friction. The easier the right behavior, the more you'll do it without even thinking."

[0:48-1:05] LESSON 3
"Lesson three: identity over outcomes. Don't say 'I want to run a marathon.' Say 'I'm a runner.' When your habits become your identity, you stop needing motivation. You just do what runners do. That shift — from having to being — is the entire book."

[1:05-1:15] TRANSFORMATION
"Three ideas. Systems over goals. Remove friction. Become the person first. That's how you change anything in your life — one atomic habit at a time."

[1:15-1:25] CTA
"Save this. Share it with someone who's stuck. Next week: The Psychology of Money — why smart people make terrible financial decisions. Follow so you don't miss it."

[1:25-1:30] END
[Loop back to book cover visual]`,
  },
};

export const ENGINE_SPECS = [
  {
    title: 'GEMINI SCRIPT GENERATION',
    specs: [
      'System prompt must enforce: HOOK in first 15 words. NO preamble.',
      'Hard cap: 240 words max per 90-second Short',
      'Force 3-point structure in value section (not 2, not 4, not 5)',
      "Every script must end with a CTA that includes 'save this'",
      'Include [VISUAL CUE] markers between each section for Timeline Editor',
      'Hook templates: rotate through 50+ patterns to avoid repetition',
      'Finance niche: require at least 3 specific numbers per script',
      'Book niche: require book title, author, sales/credibility stat in first 30 words',
    ],
  },
  {
    title: 'ELEVENLABS VOICE SETTINGS',
    specs: [
      'Finance: Male voice, confident, slightly fast (1.1x), clear diction',
      'Book Summary: Warm storyteller voice, conversational pace (1.0x)',
      'Stability: 0.65-0.75 (natural variation without instability)',
      'Similarity: 0.80+ (consistent brand voice across all videos)',
      'Hook section: boost speed to 1.15x for urgency',
      'Transformation section: slow to 0.95x for weight/impact',
      'Target: 2.7 words/second average across full script',
    ],
  },
  {
    title: 'TIMELINE EDITOR AUTOMATION',
    specs: [
      'Audio track = source of truth (voiceover drives all timing)',
      'Auto-cut: new visual every 2.5 seconds during value sections',
      'Auto-cut: new visual every 1.5 seconds during hook',
      'Cinematic zoom: slow push-in (2% over 3 seconds) on all static images',
      'Caption sync: bold white text, key words highlighted in niche color',
      'Section transitions: 0.3s flash/wipe between major sections',
      'Last 5 seconds: fade to loop frame (match first frame for replay trick)',
      'Aspect ratio: 9:16 locked. Safe zone: 80% center (avoid UI overlaps)',
    ],
  },
  {
    title: 'THUMBNAIL / FIRST FRAME',
    specs: [
      'Finance: gold/green accent on dark background. Number visible. Emotion trigger.',
      'Book: 3D book cover render + bold claim text. Author name if recognizable.',
      'Text: MAX 5 words. Readable at phone thumbnail size (150x267px test).',
      'Contrast ratio: 4.5:1 minimum (accessibility = readability = CTR)',
      'Face (if using): shocked/curious expression. Even illustrated faces work.',
      'NO: cluttered backgrounds, small text, muted colors, stock photo vibes',
    ],
  },
  {
    title: 'PUBLISHING CADENCE',
    specs: [
      'Minimum: 3 Shorts per week per channel',
      'Optimal: 5-7 Shorts per week (daily if engine can sustain)',
      "Best posting times: 12pm, 5pm, 8pm (viewer's local timezone)",
      "Series structure: 'Part 1, Part 2' numbering drives return views",
      "Book niche: 1 book = 1 Short. Publish M/W/F. Weekend = 'Top 3 lessons from this week' compilation",
      'Finance niche: topical (react to news) + evergreen (rules/principles) in 60/40 split',
    ],
  },
];