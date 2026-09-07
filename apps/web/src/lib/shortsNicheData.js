// ═══════════════════════════════════════════════════════════════
// SHORTS NICHE STRUCTURES — 90-SECOND BLUEPRINT
// Exact second-by-second, word-by-word production specs.
// ═══════════════════════════════════════════════════════════════

export const SHORTS_NICHES = {
  crime_story: {
    id: 'crime_story',
    title: 'CRIME STORY / TRUE CRIME',
    emoji: '🔪',
    color: '#dc2626',
    duration: '90 seconds',
    wordCount: '200–240 words',
    pacing: '~2.7 words/sec (suspense-driven)',
    rpm: '$5-12 RPM',
    sections: [
      {
        id: 'cold_open',
        label: 'COLD OPEN',
        time: '0:00 – 0:05',
        seconds: 5,
        words: '12–18 words',
        color: '#dc2626',
        purpose: 'Drop the viewer INTO the crime. No context. No setup. Most shocking detail first.',
        rules: [
          'Start with the most shocking detail of the entire story',
          'Use present tense ("A woman walks into a bank...")',
          'Include a specific detail that makes it REAL (date, city, dollar amount)',
          'NEVER start with "Today we\'re going to talk about..."',
          'This should feel like opening a movie 30 minutes in',
        ],
        templates: [
          '"On March 15th, 2019, a package arrived at a house in Detroit. Inside was $2.3 million. And a severed finger."',
          '"She called 911 at 3:47 AM. But the person she was running from was already inside the house."',
          '"He stole $400 million and nobody noticed for 12 years. Here\'s how."',
          '"The police found the car. The engine was still running. But the driver had been dead for 6 hours."',
          '"She married 7 men in 5 states. All of them disappeared."',
        ],
        visualSpec: 'Dark, moody establishing shot. Heavy cinematic grain. Red or blue accent lighting (police light glow). Slow push-in on the most disturbing visual element.',
        audioSpec: 'Voice: low, measured, almost whispering — true crime podcast energy. Background: single sustained low drone note. Optional: subtle heartbeat sound effect.',
      },
      {
        id: 'setup',
        label: 'THE SETUP',
        time: '0:05 – 0:20',
        seconds: 15,
        words: '35–45 words',
        color: '#f59e0b',
        purpose: 'WHO is this person? Make the viewer CARE before things go wrong. The more normal the setup, the more shocking the crime.',
        rules: [
          'Introduce the victim OR criminal as a NORMAL person first',
          '1-2 sentences of normalcy: job, family, routine',
          'Include one detail that makes them relatable/sympathetic',
          'Then: the FIRST sign something is wrong',
          'This section is the "calm before the storm"',
        ],
        templates: [
          '"David Chen was a math teacher in Portland. Married, two kids, coached little league on weekends. His neighbors called him the nicest guy on the block. But in January 2021, his wife found a second phone."',
          '"Maria Santos worked the night shift at a gas station off I-95. She\'d been doing it for 11 years. Same routine every night. Until the night a man in a grey hoodie walked in at 2:14 AM."',
        ],
        visualSpec: '"Normal life" imagery: suburban house, workplace, family. Warm, safe lighting for the normal part. Subtle color shift to cooler/darker tones. Hard cut to black for 0.5s at the turn.',
        audioSpec: 'Voice: conversational, almost warm during normal part → drops lower at the turn. Background: quiet ambient → fades to silence. The SILENCE at the turn point is most powerful.',
      },
      {
        id: 'escalation',
        label: 'THE ESCALATION',
        time: '0:20 – 0:55',
        seconds: 35,
        words: '85–100 words',
        color: '#ef4444',
        purpose: 'The crime unfolds. LONGEST section. Stack details rapidly. Jaw should drop at least twice.',
        rules: [
          'Rapid-fire facts — each sentence reveals something new and worse',
          'Use time stamps ("By March, he had stolen $50K. By June, $400K.")',
          'Build with "but it gets worse" or "and then they discovered..."',
          'Include at least ONE moment where the criminal almost got caught but didn\'t',
          'Every 5-7 seconds: a new revelation',
          'Beat 1 (0:20-0:30): Crime begins — first incident',
          'Beat 2 (0:30-0:40): Gets worse — pattern emerges, stakes rise',
          'Beat 3 (0:40-0:50): Near-miss — almost caught but escapes',
          'Beat 4 (0:50-0:55): Peak — the biggest revelation',
        ],
        templates: [
          '"The second phone had 47 contacts — all women. David had been running a romance scam from his classroom during lunch breaks. He\'d convinced 12 women he was a widowed surgeon. By the time his wife found the phone, he\'d collected over $800,000. But here\'s the part nobody saw coming. David wasn\'t keeping the money. Every dollar was going to an offshore account controlled by someone else. David wasn\'t the mastermind. David was being blackmailed."',
        ],
        visualSpec: 'Rapid montage: evidence, messages, locations, money. Color palette progressively darker. Text overlays for key numbers. Each beat gets its own visual set.',
        audioSpec: 'Voice: energy rises steadily — starts measured, ends urgent. Tension music builds. Sound design punctuates key revelations. Beat 4: music drops out completely for biggest reveal.',
      },
      {
        id: 'twist',
        label: 'THE TWIST / RESOLUTION',
        time: '0:55 – 1:10',
        seconds: 15,
        words: '35–40 words',
        color: '#8b5cf6',
        purpose: 'The payoff. How did it end? Was there justice? The twist should reframe EVERYTHING the viewer just heard.',
        rules: [
          'The ending must SURPRISE — if it\'s predictable, the whole video fails',
          'Best twists: criminal was someone unexpected, victim fought back, still unsolved, or punishment was wild',
          'If satisfying ending → deliver cleanly',
          'If unsolved → lean into mystery ("and to this day...")',
          'One strong final image that burns into memory',
        ],
        templates: [
          '"The person blackmailing David? His wife\'s best friend. She\'d been running the entire operation for 3 years, using David as a puppet. She\'s currently serving 22 years in federal prison. David got 8."',
          '"The FBI never found the money. The Whitfields vanished. Their house was auctioned off in 2023. The buyer found a safe in the basement. It was empty. Except for a note that said: \'You\'re too late.\'"',
        ],
        visualSpec: 'HARD CUT to resolution image (mugshot-style, courtroom, prison). If justice served: slightly warmer lighting. If unsolved: cold blue grade, empty landscape.',
        audioSpec: 'Voice: slow, deliberate, heavy — each word lands. Brief silence after final sentence before CTA begins.',
      },
      {
        id: 'cta',
        label: 'CTA / CLIFFHANGER',
        time: '1:10 – 1:25',
        seconds: 15,
        words: '30–35 words',
        color: '#06b6d4',
        purpose: 'Drive follows, saves, and set up the NEXT story.',
        rules: [
          'Ask a moral question ("Would you have turned him in?")',
          'Tease the next story ("But this isn\'t even the craziest one...")',
          'Use "save this" language',
          'Crime audience LOVES series — "Part 2 drops Friday"',
          'End with an unresolved question to drive comments',
        ],
        templates: [
          '"That\'s a real story. It happened 3 years ago. Save this. Follow for Part 2 — the case that made the FBI change their entire protocol."',
          '"Would you have noticed the signs? Comment what you would\'ve done. Save this and follow — next week\'s story is worse. Much worse."',
        ],
        visualSpec: 'Return to branded end card. "SAVE THIS" animated text. Next story teaser image (blurred or silhouetted for mystery).',
        audioSpec: 'Voice: direct, personal. Background: resolves. Ends with slight tension if teasing Part 2.',
      },
      {
        id: 'loop',
        label: 'LOOP',
        time: '1:25 – 1:30',
        seconds: 5,
        words: '0',
        color: '#525252',
        purpose: 'Loop back to cold open visual (creates replay).',
        rules: ['Loop back to cold open visual', 'OR: black screen with single haunting text line from the story'],
        templates: [],
        visualSpec: 'Seamless visual loop back to the cold open frame.',
        audioSpec: 'Music fades. Silence.',
      },
    ],
  },
  tech_explainer: {
    id: 'tech_explainer',
    title: 'TECH EXPLAINER / HOW X WORKS',
    emoji: '⚡',
    color: '#06b6d4',
    duration: '90 seconds',
    wordCount: '200–240 words',
    pacing: '~2.7 words/sec (rapid-fire informational)',
    rpm: '$8-30 RPM',
    sections: [
      {
        id: 'wtf_hook',
        label: 'WTF HOOK',
        time: '0:00 – 0:05',
        seconds: 5,
        words: '12–18 words',
        color: '#dc2626',
        purpose: 'Make a technical concept feel URGENT and PERSONAL. Lead with consequence or absurdity.',
        rules: [
          'Lead with the CONSEQUENCE or the ABSURDITY, not the technology',
          'Make it sound broken, dangerous, or insane',
          'Use "you" or imply the viewer is affected',
          'Exaggeration is fine if directionally true',
          'Nobody clicks "how TCP/IP works" — they click "the internet is held together by duct tape"',
        ],
        templates: [
          '"Your phone listens to 40,000 commands per second and you\'ve never noticed."',
          '"The entire internet runs on a protocol invented by a college student in 1991. It was supposed to be temporary."',
          '"AI can now clone your voice in 3 seconds. And there\'s no law against it."',
          '"Every password you\'ve ever created is useless. Here\'s why."',
        ],
        visualSpec: 'Bold kinetic text on dark background (white/neon green on black). Slight glitch effect or scan-line overlay. Fast text animation synced to voiceover.',
        audioSpec: 'Voice: fast, confident, slightly amused. Background: electronic/synth low hum. Energy: HIGH from first syllable.',
      },
      {
        id: 'context_bomb',
        label: 'CONTEXT BOMB',
        time: '0:05 – 0:20',
        seconds: 15,
        words: '35–45 words',
        color: '#f59e0b',
        purpose: 'Just enough background. Not a history lesson. "Here\'s what you need to know in 15 seconds."',
        rules: [
          'Origin story in 1-2 sentences (who made it, when, why)',
          'One surprising fact about its scale or impact (a number)',
          'Frame it as: "this thing you take for granted is actually insane"',
          'Avoid jargon — if you must use a technical term, define it instantly',
        ],
        templates: [
          '"In 1995, two Stanford PhD students built a search engine in a garage. Today it processes 8.5 billion searches per day. But the algorithm behind it — PageRank — is based on a concept so simple, a 10-year-old could understand it."',
          '"In 2017, a team at Google published a paper called \'Attention Is All You Need.\' That 11-page document created ChatGPT, Gemini, Claude, and basically every AI you use today."',
        ],
        visualSpec: 'Timeline graphic or "evolution" visual. Key number appears as large animated text. Founder image. Clean, minimal design.',
        audioSpec: 'Voice: informational, authoritative, slightly awed. Background: subtle electronic rhythm builds.',
      },
      {
        id: 'the_mechanic',
        label: 'THE MECHANIC — 3 STEPS',
        time: '0:20 – 0:55',
        seconds: 35,
        words: '85–100 words',
        color: '#22c55e',
        purpose: 'The core explanation. Break the technology into 3 STEPS or 3 LAYERS. Use analogies. Make a 5-year-old understand.',
        rules: [
          'Exactly 3 steps/layers/parts',
          'Each step: 1 sentence what it does + 1 sentence analogy/example',
          'Use ANALOGIES religiously — "think of it like a librarian..."',
          'Step 1: the simplest concept (foundation)',
          'Step 2: the clever part (the innovation)',
          'Step 3: the mind-blowing part (the thing that makes it work at scale)',
          'New visual every 2-3 seconds',
        ],
        templates: [
          '"Step 1: Your phone sends a tiny packet of data — like a postcard with your request. It sends it to a tower, which bounces it to a server.\n\nStep 2: That packet doesn\'t travel one path. It gets SPLIT into dozens of fragments, each taking a different route. Like sending a puzzle in 50 different envelopes through 50 different post offices.\n\nStep 3: Your phone reassembles all 50 pieces in the correct order in under 200 milliseconds. The entire internet is millions of puzzles being shattered and reassembled billions of times per second."',
        ],
        visualSpec: 'Each step marked with bold STEP 1/2/3 header. Simple animated diagrams. Color-code each step. Diagrams should be SIMPLE — napkin sketch level.',
        audioSpec: 'Voice: building excitement with each step (Step 1 calm → Step 3 amazed). Sound design: whoosh for data movement, click for reassembly.',
      },
      {
        id: 'so_what',
        label: 'REAL-WORLD PROOF / SO WHAT',
        time: '0:55 – 1:10',
        seconds: 15,
        words: '35–40 words',
        color: '#8b5cf6',
        purpose: 'Connect the mechanic to something the viewer USES. "This is why your Netflix loads in 2 seconds."',
        rules: [
          '1-2 real-world examples that make the viewer go "ohhhh"',
          'Tie it to their daily life (phone, money, security)',
          'Include a forward-looking prediction or implication',
          'Transforms "interesting fact" into "useful knowledge"',
        ],
        templates: [
          '"That\'s why your 4K video streams without buffering while someone else in your house is on a video call. The same protocol runs global banking, air traffic control, and every smart device in your home. And in 2026, it\'s about to get replaced by something 10x faster."',
        ],
        visualSpec: 'Real-world application montage. Future prediction visual. Return to bright/warm lighting.',
        audioSpec: 'Voice: confident, forward-looking, slightly ominous on prediction.',
      },
      {
        id: 'cta',
        label: 'CTA',
        time: '1:10 – 1:25',
        seconds: 15,
        words: '30–35 words',
        color: '#06b6d4',
        purpose: 'Drive saves and set up next video.',
        rules: [
          '"Save this" language',
          'Tease next topic (related tech)',
          'Ask: "Which step blew your mind?"',
          'Series mechanic: "Follow for the deep dive"',
        ],
        templates: [
          '"Now you know how [X] actually works. Save this — you\'ll want to explain it to someone. Follow for the next one: [related tech] that\'s even crazier. Which step blew your mind?"',
        ],
        visualSpec: '"SAVE THIS" animated text. Next topic teaser. Channel branding, clean and minimal.',
        audioSpec: 'Voice: warm wrap-up. Music resolves.',
      },
      {
        id: 'loop',
        label: 'LOOP',
        time: '1:25 – 1:30',
        seconds: 5,
        words: '0',
        color: '#525252',
        purpose: 'Loop back to WTF hook visual.',
        rules: ['Loop back to hook visual', 'OR: code/data rain animation fading to black'],
        templates: [],
        visualSpec: 'Seamless visual loop to opening frame.',
        audioSpec: 'Silence.',
      },
    ],
  },
  side_hustle: {
    id: 'side_hustle',
    title: 'SIDE HUSTLE / HOW-TO / MONEY',
    emoji: '💸',
    color: '#22c55e',
    duration: '90 seconds',
    wordCount: '200–240 words',
    pacing: '~2.7 words/sec (instructional urgency)',
    rpm: '$15-40 RPM',
    sections: [
      {
        id: 'proof_hook',
        label: 'PROOF HOOK',
        time: '0:00 – 0:05',
        seconds: 5,
        words: '12–18 words',
        color: '#dc2626',
        purpose: 'Show the RESULT first. Money earned. Transformation. Viewer needs to SEE the destination.',
        rules: [
          'Lead with a specific dollar amount or result',
          'Include a timeframe (makes it achievable)',
          'Include a constraint ("no experience", "2 hours a day", "from my phone")',
          'NEVER: "I\'m going to show you how to..."',
          'ALWAYS: "I made $X doing Y in Z time"',
          'The number must be SPECIFIC — $4,327 beats "thousands of dollars"',
        ],
        templates: [
          '"I made $4,327 last month with a side hustle that takes 2 hours a day. No experience. No startup cost. Here\'s exactly how."',
          '"$11,000 in 30 days. No followers. No product. No skills. Just this one method."',
          '"$500 a week. Phone only. 90 minutes a day. I\'ll show you the exact steps."',
        ],
        visualSpec: 'Income dashboard screenshot (Stripe, PayPal). Green accent color. Dollar amount as HUGE text overlay. Must feel REAL, not stock-photo-fake.',
        audioSpec: 'Voice: casual, direct, "I\'m just telling you what I did." NOT hype-bro energy — calm confidence.',
      },
      {
        id: 'myth_kill',
        label: 'MYTH KILL',
        time: '0:05 – 0:15',
        seconds: 10,
        words: '25–30 words',
        color: '#f59e0b',
        purpose: 'Destroy the viewer\'s excuses BEFORE they think of them. Kill objections.',
        rules: [
          'Address the #1 objection directly ("You don\'t need followers")',
          'Contrast with what they\'ve been told ("Forget dropshipping...")',
          'Position as something DIFFERENT from what they\'ve tried',
          'Use "You don\'t need X, Y, or Z" structure',
        ],
        templates: [
          '"You don\'t need followers. You don\'t need a website. You don\'t need to create content. This isn\'t dropshipping, this isn\'t crypto, and this isn\'t another course selling you a dream."',
          '"No capital. No inventory. No audience. No tech skills. If you can use Google and follow instructions, you can do this."',
        ],
        visualSpec: 'Objections appear as text → red X strikes through each one. Clean, simple graphics. Transition: green checkmark or "HERE\'S HOW" title card.',
        audioSpec: 'Voice: empathetic but firm — "I get it, but listen." Slight energy lift on final sentence → pivot into method.',
      },
      {
        id: 'the_method',
        label: 'THE METHOD — 3 STEPS',
        time: '0:15 – 1:00',
        seconds: 45,
        words: '110–130 words',
        color: '#22c55e',
        purpose: 'The actual how-to. Three clear, actionable steps. Each step must be DOABLE TONIGHT.',
        rules: [
          'Exactly 3 steps — labeled "Step 1, Step 2, Step 3"',
          'Each step: 15 seconds, ~35-43 words',
          'Step 1: THE SETUP — what to sign up for / what to create',
          'Step 2: THE WORK — the actual activity that generates money',
          'Step 3: THE SCALE — how to go from first dollar to real income',
          'Each step must name SPECIFIC tools, platforms, or actions',
          'Include a specific number in each step',
        ],
        templates: [
          '"Step 1: Go to Fiverr and create a gig offering AI-generated thumbnails. Use Midjourney or Ideogram to make them. Price your first gig at $15.\n\nStep 2: Find YouTube channels with 10K-100K subs that have terrible thumbnails. DM them a free sample. I sent 20 DMs my first week and got 4 paying clients.\n\nStep 3: Raise your price to $35 per thumbnail. Offer monthly packages — 8 thumbnails for $200. Three monthly clients is $600/month for 6 hours/week."',
        ],
        visualSpec: 'Each step: bold STEP 1/2/3 title card. Screen recording or mockups of the platform. Key actions highlighted as text overlays. Show the RESULT of each step.',
        audioSpec: 'Voice: instructional, like a friend explaining over coffee. Energy builds per step. Pause briefly between steps.',
      },
      {
        id: 'proof_again',
        label: 'PROOF AGAIN',
        time: '1:00 – 1:10',
        seconds: 10,
        words: '25–30 words',
        color: '#8b5cf6',
        purpose: 'Loop back to PROOF. Remind them this is real. Show the transformation.',
        rules: [
          'Specific income number + timeframe',
          'Mention how long to reach that level',
          'Include one "it\'s not perfect" moment for credibility (first month was only $200)',
        ],
        templates: [
          '"My first month I made $217. Not life-changing. But by month 3, I hit $2,400. By month 6, I replaced my 9-to-5 income completely."',
          '"I started with $0 and 0 followers. Right now, this brings in $4,300 a month working 10 hours a week."',
        ],
        visualSpec: 'Income growth timeline graphic. Green accent on final/current number. Real, authentic feel.',
        audioSpec: 'Voice: honest, grounded, then proud on the big number.',
      },
      {
        id: 'cta',
        label: 'CTA',
        time: '1:10 – 1:25',
        seconds: 15,
        words: '30–35 words',
        color: '#06b6d4',
        purpose: 'Drive saves (this is a "reference" video people come back to). Series mechanic.',
        rules: [
          '"Save this" is CRITICAL — side hustle content gets saved more than any other niche',
          '"I\'m dropping a new method every week" → series mechanic',
          'Tease next video with a specific dollar amount',
          'Ask: "Which step are you starting with?"',
          'NEVER: "like and subscribe" — ALWAYS: "save this and try Step 1 tonight"',
        ],
        templates: [
          '"Save this video. Try Step 1 tonight — it takes 5 minutes. Follow for the next one: a method doing $7K a month with zero social media. Which step are you starting with?"',
        ],
        visualSpec: '"SAVE THIS" animated text. Teaser for next method. Channel branding.',
        audioSpec: 'Voice: energized, direct call to action.',
      },
      {
        id: 'loop',
        label: 'LOOP',
        time: '1:25 – 1:30',
        seconds: 5,
        words: '0',
        color: '#525252',
        purpose: 'Loop back to income proof visual from hook.',
        rules: ['Loop back to income proof visual', 'OR: Step 1 visual (subconscious "go do this NOW" trigger)'],
        templates: [],
        visualSpec: 'Seamless visual loop to opening income proof.',
        audioSpec: 'Silence.',
      },
    ],
  },
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
  crime_story: {
    title: 'She Married 7 Men. None of Them Survived.',
    wordCount: '237 words',
    script: `[0:00-0:05] COLD OPEN
"Between 2010 and 2018, seven men married the same woman in five different states. All seven are now dead."

[0:05-0:20] SETUP
"Sandra Mitchell was a hospice nurse in Louisville. Her coworkers described her as caring, patient, and kind. She volunteered at her church every Sunday. She also had a profile on six different dating sites — each with a different name, a different photo, and a different story."

[0:20-0:35] ESCALATION BEAT 1
"Her first husband died of a heart attack four months after the wedding. She collected $150,000 in life insurance. She moved to Tennessee. Married again. Husband number two died of a stroke seven months later. Insurance payout: $200,000."

[0:35-0:50] ESCALATION BEAT 2
"By husband number five, Sandra had collected over $1.2 million. Each death was ruled natural causes. Each time, she moved to a new state. New name, new dating profile, new church. But husband number six had a daughter who was a toxicology student."

[0:50-0:55] ESCALATION BEAT 3
"The daughter ordered a private autopsy. They found traces of a compound that doesn't show up on standard toxicology screens. She had been poisoning them — slowly — for months."

[0:55-1:10] TWIST
"Sandra was arrested in 2019. During the trial, prosecutors revealed she'd been researching untraceable poisons since 2008 — two years before her first marriage. This was never impulse. It was a business plan. She was sentenced to seven consecutive life terms. One for each husband."

[1:10-1:25] CTA
"Seven husbands. Seven deaths. One woman. And the only reason she got caught was a daughter who refused to accept the easy answer. Save this. Follow for the next story — a man who stole an entire town. Literally. The whole town."

[1:25-1:30] END
[Loop back to cold open visual]`,
  },
  tech_explainer: {
    title: 'WiFi Is Lying to You (Here\'s How It Actually Works)',
    wordCount: '232 words',
    script: `[0:00-0:05] WTF HOOK
"WiFi doesn't send your data through the air. It sends it through invisible light. And it's way weirder than you think."

[0:05-0:20] CONTEXT BOMB
"In 1997, a group of engineers created a standard called 802.11. It let devices talk to each other using radio waves — the same kind your microwave uses. Today, 18 billion devices use WiFi. Your house probably has 30 of them. But almost nobody understands what's actually happening."

[0:20-0:35] STEP 1
"Step one: your router is basically a tiny radio station. It broadcasts a signal on a specific frequency — usually 2.4 or 5 gigahertz. Your phone has a receiver that listens to that frequency. Think of it like a walkie-talkie that works both ways."

[0:35-0:48] STEP 2
"Step two: the clever part. Your data doesn't travel as a stream. It travels as pulses — ones and zeros encoded into the shape of a radio wave. Your router is literally reshaping invisible waves to spell out your Netflix request."

[0:48-0:55] STEP 3
"Step three: the insane part. Every WiFi device in your house is screaming on the same frequency simultaneously. Your router separates them by giving each device a unique time slot — switching between 30 devices thousands of times per second. It's juggling chainsaws at light speed."

[0:55-1:10] SO WHAT
"That's why your WiFi slows down when more people connect. More devices means more juggling. And it's why WiFi 7 is a big deal — it can juggle across three frequencies at once instead of one. Your internet is about to triple in speed."

[1:10-1:25] CTA
"Now you know what WiFi actually does. Save this. Follow for the next one — how Bluetooth actually works, and why it's named after a Viking king. Which step surprised you most?"

[1:25-1:30] END
[Loop back to hook visual]`,
  },
  side_hustle: {
    title: 'I Made $3,800/Month Selling AI Thumbnails (Exact Steps)',
    wordCount: '238 words',
    script: `[0:00-0:05] PROOF HOOK
"$3,800 last month making YouTube thumbnails with AI. No design skills. 8 hours a week. Here's exactly how I did it."

[0:05-0:15] MYTH KILL
"You don't need Photoshop. You don't need a design degree. You don't need to be creative. AI does 90% of the work. You just need to know what YouTubers actually want — and I'm about to tell you."

[0:15-0:30] STEP 1
"Step one: sign up for Ideogram or Midjourney. Cost is $10 a month. Then go to Fiverr and create a gig that says 'I will design viral YouTube thumbnails using AI.' Set your price at $20. Upload 5 sample thumbnails you made for popular niches — finance, fitness, tech."

[0:30-0:45] STEP 2
"Step two: find your clients. Search YouTube for channels between 10K and 100K subscribers. Look for channels where the content is good but the thumbnails are awful. Make a free thumbnail for their latest video. DM them with the sample. I did this 20 times my first week. Got 5 paying clients."

[0:45-1:00] STEP 3
"Step three: scale it. After your first 5 clients, raise your price to $40. Offer monthly packages — 8 thumbnails for $250 per month. Four monthly clients is $1,000 a month. Then outsource production to another AI user for $8 per thumbnail. Keep the margin. That's how $1,000 becomes $3,800."

[1:00-1:10] PROOF AGAIN
"Month one I made $340. Month two: $1,100. By month four I hit $3,800 and I was working less than when I started. The demand is insane — there are 50 million YouTube channels and most of their thumbnails are garbage."

[1:10-1:25] CTA
"Save this right now. Do Step 1 tonight — it takes 10 minutes. Follow me for the next method — it's doing $5K a month with zero clients and zero outreach. Which step are you starting first? Comment below."

[1:25-1:30] END
[Loop back to income proof visual]`,
  },
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