// SAM WANTS YOUR RAM - all the jokes. Parody only.
// Rule: the ONLY quoted sentences attributed to Sam Altman are the three in QUOTES (as reported by Tom's Hardware).
// Everything else is a cartoon speech-bubble taunt in character voice, or an obviously absurd headline.

export const QUOTES: { text: string; attribution: string }[] = [
  { text: "it's quite terrible to have everybody have a bunch of the world's limited supply of DRAM sitting in their own computer and being used 5% of the time", attribution: 'Sam Altman, Cheeky Pint podcast, Oct 2026' },
  { text: "You want maximum utilization in the cloud if you're trying to deal with this very supply-constrained environment.", attribution: 'Sam Altman, Cheeky Pint podcast, Oct 2026' },
  { text: "And somehow many people's intuition is the opposite of that.", attribution: 'Sam Altman, Cheeky Pint podcast, Oct 2026' },
];

export const DISCLAIMER = "Parody. Not affiliated with or endorsed by Sam Altman or OpenAI. Quotes as reported by Tom's Hardware from the Cheeky Pint podcast (Oct 29, 2026).";

export const NEWS: string[] = [
  "A DDR5 kit now costs more than your GPU, and your GPU now costs more than your car",
  "Local man opens 12 browser tabs, receives eviction notice from his own computer",
  "Analyst: your RAM is idle most of the day, same as your gym membership, but nobody wants to rent out the gym",
  "Cartoon Sam declares idle memory a tragedy; cartoon screensaver files complaint",
  "Startup raises $2B to rent you the RAM you already own, at a 40x markup (satire)",
  "Cloud provider announces Bring Your Own Computer tier; computer sold separately, also rented",
  "Gamers adapt: 'Download More RAM' sites now charging actual money, somehow still fake",
  "Experts recommend streaming your RAM back with 400ms of latency for authentic buffering",
  "Man sells kidney for 64GB kit, buyer asks if he has any spare cache",
  "Chip fabs run out of wafers, suggest customers try pasta, it's also round and flat",
  "Your toaster now requires 16GB to toast; cartoon Sam: finally, a use case",
  "Memory prices hit record high; record collectors confused why it is not vinyl",
  "Local dad builds PC in 2019, now technically a millionaire in DIMMs",
  "Cloud company to rent you a computer, a monitor, and a feeling of ownership, billed monthly",
  "Rumor: your RAM is not lazy, it is 'resting for maximum utilization later'",
  "Library offers free RAM lending; line stretches around block, buffering",
  "Tech blog declares ownership dead, then asks readers to subscribe for ownership-death updates",
  "Tiny robot reportedly seen running off with several sticks in a lunchbox; experts call it fair allocation",
  "Server racks now taller than the promises made about them",
  "Mom: Why is the family PC slow? Dad: Because we're streaming it from Nevada, Linda",
  "DDR5 prices change so fast, retailers switch to mood rings",
  "Study: 5% utilization is 'fine, actually'; study mysteriously still unfunded",
  "Cloud outage briefly returns RAM to owners; owners report weird warm feeling, possibly ownership",
  "Retailer limits customers to one RAM stick per household, two per lifetime",
  "Scientists confirm you still cannot download RAM, but several pitch decks are trying",
  "ECC Shield sales surge as people prepare for emotionally uncorrectable errors",
  "Local PC enthusiast guards DIMMs with dog; dog now worth less than the DIMMs",
  "Overclockers report new hobby: yelling at invoices",
  "Jump cable bundles now legal tender in three data centers and one confused pawn shop",
  "Memory shortage to end in 2027, says forecast last updated in a fortune cookie",
  "Breaking: 5% utilization rebranded as 'strategic rest', wellness industry thrilled",
  "Humanity's idle RAM spotted lounging; sources say it 'just wants to be left alone'",
  "Report: 95% of your RAM is thinking about nothing. Sam would like it to think about the cloud",
  "Man defrauded by 'free RAM' link; learns lesson about free things and also about RAM",
];

export const TIPS: string[] = [
  "Tip: Jump cable bundles to clear them. Touching them is how electrons get their revenge.",
  "Slide under rate limiters. Kilo has no dignity but excellent ground clearance.",
  "Letters of Intent dissolve when you get close. Non-binding is a lifestyle.",
  "ECC Shield absorbs one hit. Emotional damage still gets through.",
  "DMA Magnet pulls RAM from all lanes. Finally, direct access nobody can bill for.",
  "Every GB you grab is a GB Sam does not get. Greed is only bad when it is his.",
  "Three sticks, three lives. Lose them all and Sam gets a bigger cloud.",
  "Streaks raise pickup pitch. Your ears are being utilized at 100%. You're welcome.",
  "Sam is faster than he looks. So is rent.",
  "Switch lanes early. Late switching is just buffering with extra steps.",
  "Cartoon Sam hates idle RAM. This tip is idle 100%. Go get that pickup.",
  "Hit something with zero RAM and you're caught. Own nothing, lose everything.",
  "Tip: do not read the Terms of Service. Nobody has. Not even the ones who wrote them.",
  "Pause is free. Unpausing will be $4.99 in the premium build.",
  "Ramps lead to rack tops. Up there the air is thin and the uptime is thick.",
  "A DMA Magnet is a gift. Grab it before somebody lists it as a service.",
  "A streak is just a subscription you actually want.",
  "Rate limiters are everywhere. That's what they call fair use in the lobby.",
  "ECC means Errors Can Costar. Keep that shield up when things get dramatic.",
  "Kilo runs on spite and 5% utilization. Be like Kilo.",
  "Jump early, slide late, think never. Reflexes are not a cloud service. Yet.",
  "Stay in the middle lane when unsure. Middle is where the RAM goes to be undecided.",
  "Sam is loud for a reason: he's trying to drown out the sound of your fans spinning up.",
  "Missing a jump? Don't worry. The data center forgives. For a monthly fee.",
  "Share your score. Nothing says 'I own my own RAM' like posting it to someone else's server.",
  "Beat a friend's challenge link and it shows on your game over. Gloating is a premium feature, free here.",
  "Loading tip: this tip is being streamed from a server in another state. Enjoy the latency.",
];

export const TAUNTS: Record<
  'chase' | 'hit' | 'close' | 'powerup' | 'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'near' | 'collect' | 'catch',
  string[]
> = {
  chase: [
    "Just rent it!",
    "RAM-as-a-Service, $19.99/mo!",
    "Your RAM looks lonely.",
    "That's quite terrible!",
    "Used 5% of the time!",
    "Maximum utilization!",
    "So supply-constrained!",
    "Stream it back, it's fine!",
    "Think of the utilization!",
    "Idle RAM is sad RAM!",
  ],
  hit: [
    "Ooh, that's a fee!",
    "Utilization intensifies!",
    "Terms accepted by impact!",
    "Quite terrible, that stumble!",
    "Pay per bump!",
    "Billing you for that!",
    "Read the fine print, Kilo!",
  ],
  close: [
    "Almost leased you!",
    "I can taste the uptime!",
    "Come to the cloud, Kilo!",
    "Just sign here, one sec!",
    "Closer... subscribed!",
  ],
  powerup: [
    "Hey! That was allocated!",
    "Unauthorized shield!",
    "That's a premium feature!",
    "Who gave you that?!",
    "Not in your plan!",
  ],
  stage1: [
    "Round two has a surcharge.",
    "You ran well. Rent well!",
    "Cute. Wait for the pricing.",
  ],
  stage2: [
    "Idle bots get recycled!",
    "Let me count it. Then bill it.",
    "A workload with legs!",
  ],
  stage3: [
    "Fine, run. But can you SCALE?",
    "Racks are my hobby!",
    "I'm not mad. I'm optimized.",
  ],
  stage4: [
    "This is quite terrible!",
    "That RAM was mine, logically!",
    "I'll vacuum the building!",
  ],
  stage5: [
    "A RAM parachute?! Efficient...",
    "Come back! Such utilization!",
    "Keep it! ...For rent? Hello?",
  ],
  near: [
    "Near miss! Billing paused.",
    "Almost got the invoice!",
    "Stop dodging my cloud!",
    "Can't suck that one up!",
    "Slippery little bot!",
    "Dodge forever? Not scalable!",
  ],
  collect: [
    "Hey, that's my RAM!",
    "Put it back, it's reserved!",
    "That stick was 5% used!",
    "Thief! It's for the cloud!",
    "My DIMMs! My DIMMs!",
  ],
  catch: [
    "Welcome to the cloud!",
    "RAM acquired. Kilo allocated.",
    "Your RAM is now efficient!",
    "Subscription started!",
    "Maximum utilization, baby!",
    "Just rent it next time!",
  ],
};

export const KILO_LINES: Record<
  'stage1' | 'stage2' | 'stage3' | 'stage4' | 'stage5' | 'win' | 'hit' | 'powerup',
  string[]
> = {
  stage1: ["Beep! One rack down.", "Bleep. Warm up complete.", "Bzzt! Lunchbox is full."],
  stage2: ["Boop. He's gaining. I'm vibing.", "Beep beep. Still unsubscribed.", "Bzzt. Ownership intact!"],
  stage3: ["Bleep... racks are tall today.", "Whirr. Needs more RAM. Always.", "Beep! Rack tops, here I come."],
  stage4: ["Bzzz! Sticks are heavy. Worth it.", "Boop. Where is the exit?", "Beep... almost home. Ish."],
  stage5: ["Bzzt! Parachute, activate!", "Bleep! Jump jump jump!", "Beeeep! Freedom unlocked!"],
  win: ["Beep! Everyone owns RAM again!", "Boop. Prices are falling. Nice.", "Bzzt! Own it. Run it. Enjoy it."],
  hit: ["Bzzzt! Ow, my bits.", "Beep! Not in the warranty.", "Whirr-ow!"],
  powerup: ["Bleep! Shiny!", "Beep-boop! Free upgrade!", "Bzzt! Don't tell Sam."],
};

export const CUTSCENES: {
  title: string;
  panels: { who: 'kilo' | 'allocman' | 'narrator'; text: string }[];
}[] = [
  {
    title: "STAGE 1 COMPLETE: THE LOADING DOCK",
    panels: [
      { who: 'narrator', text: "Kilo slips past the loading dock, lunchbox of RAM in tow. Alarms politely request a subscription." },
      { who: 'allocman', text: "Hold on, little bot! That RAM sits idle! That's quite terrible! Hand it over for maximum utilization!" },
      { who: 'kilo', text: "Beep. It was resting. Like a normal person on a Sunday. Bzzt." },
    ],
  },
  {
    title: "STAGE 2 COMPLETE: THE COLD AISLE",
    panels: [
      { who: 'narrator', text: "Cold air whips through the aisle. Somewhere, a fan is working harder than the legal department." },
      { who: 'allocman', text: "Just rent it! RAM-as-a-Service, only $19.99 a month! First nanosecond free!" },
      { who: 'kilo', text: "Bleep. I'll take the loophole where I keep my own RAM. Boop." },
    ],
  },
  {
    title: "STAGE 3 COMPLETE: THE HIGH RACKS",
    panels: [
      { who: 'narrator', text: "Kilo scales the racks. Below, a thousand browser tabs close in unison." },
      { who: 'allocman', text: "Stop running! Send the RAM to the cloud and we'll stream it right back! Latency is a state of mind!" },
      { who: 'kilo', text: "Beep... It's my RAM. I'd like to keep it where I can see it. Bzzt." },
    ],
  },
  {
    title: "STAGE 4 COMPLETE: THE ROOFTOP SERVERS",
    panels: [
      { who: 'narrator', text: "On the rooftop, the sky is huge. The Wi-Fi is not." },
      { who: 'allocman', text: "So supply-constrained! Every stick in the cloud, working at maximum! Why won't you let me help?!" },
      { who: 'kilo', text: "Bleep. I'd rather love-language an actual computer. Boop." },
    ],
  },
  {
    title: "FINALE: THE GREAT ESCAPE",
    panels: [
      { who: 'narrator', text: "At the edge of the roof, Kilo unfurls a parachute stitched from rescued RAM sticks. It is dramatically ugly and 100% efficient." },
      { who: 'kilo', text: "Beep-beep-BOOOP! Everyone gets their RAM back! Bzzt!" },
      { who: 'allocman', text: "Noooo! My utilization! ...Is anyone going to subscribe? Anyone? Hello?" },
    ],
  },
];

export const GAMEOVER_TITLES: string[] = [
  "Your RAM has been moved to the cloud",
  "Kilo has been successfully utilized",
  "Congratulations, you are now 100% utilized",
  "Your session has been optimized (terminated)",
  "Segmentation fault (core ownership dumped)",
  "Sam has acquired your sticks",
  "Welcome to your new rented life",
];

export const GAMEOVER_SUB: string[] = [
  "Subscribe for $19.99/mo to access it",
  "Upgrade to Premium to un-vacuum your RAM",
  "RAM Plus: now with 5% more of your own RAM",
  "Pay $4.99 to see what you lost, $9.99 to feel bad about it",
  "Try Memory Rental Pro, first week free, then forever",
  "Free trial: 3 minutes of your own RAM",
  "Add Latency Shield for just $2.99 per millisecond",
];

export const CREDITS: string[] = [
  "SAM WANTS YOUR RAM",
  "a.k.a. RAM RUN",
  "Directed by: a tab that was never closed",
  "Starring: KILO, a bot with a lunchbox and a dream",
  "Also starring: Cartoon Sam Altman, as a cartoon, about RAM",
  "Executive Producer: Your RAM, Used 5% of the Time",
  "Music: the hum of a fan that has seen things",
  "Art Direction: a very motivated rectangle",
  "Voice Acting: beeps, bleeps and one existential boop",
  "Quality Assurance: we ran it at 5% utilization, it worked",
  "No DIMMs were harmed. Several were emotionally leased.",
  "Special Thanks: anyone who kept their old PC",
  "Quotes as reported by Tom's Hardware, from the Cheeky Pint podcast (Oct 29, 2026)",
  DISCLAIMER,
  "All other lines are cartoon speech bubbles and jokes, not statements of fact",
  "Made with love, spite and about 5% of a computer",
  "Own your RAM. Run your game. Thanks for playing.",
];

export const PRICE_TICKER: string[] = [
  "DDR5 32GB: $412 ▼ 38%",
  "DDR5 64GB: $799 ▼ 41%",
  "DDR4 16GB: $89 ▼ 52%",
  "LETTERS OF INTENT: $0.00 ▼ 100%",
  "WAFER FUTURES: SUPPLY-CONSTRAINED ▲",
  "CLOUD RENT: $19.99/mo ▼ \"WHAT RENT?\"",
  "RAM USED: 5% ▲ 100% (cloud)",
  "YOUR OWN RAM: PRICELESS ▲ 100%",
];
