import { PrismaClient } from "@prisma/client";

/**
 * The one-tap messages.
 *
 * Two audiences per row. `label` is what he reads on a button, in site
 * language, scannable one-handed in the sun. `body` is what the owner reads,
 * in their language — no trade names, no abbreviations, no "PC items".
 *
 * Rules encoded here:
 *
 *  - Slots are pickers, never a keyboard. A keyboard on a site with dusty
 *    hands is the thing being designed out.
 *  - Nothing names a trade or a company. "The bricklayer", never "Dave from
 *    XYZ Bricklaying". It gets back to them.
 *  - Anything that moves a date later has autoPublish false, so it drafts
 *    rather than sends. An owner whose lease ends on the 10th must not learn
 *    from a push notification that their house slipped to the 14th.
 *  - A quiet day is a template too. "Nothing on site today" is content, not
 *    absence, and it is the single most reassuring thing he can send.
 */

type Slot = { name: string; label: string; options: string[] };

const TRADES = [
  "bricklayer", "carpenter", "concreter", "electrician", "plasterer",
  "plumber", "roofer", "tiler", "painter", "waterproofer", "cabinetmaker",
];

/** Handover moves in months, which is also how it is shown to owners. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NEXT_DAY = [
  "tomorrow", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  "early next week", "later next week",
];

const T: {
  key: string; label: string; body: string; category: string;
  kind?: "progress" | "delay" | "milestone" | "weather" | "message" | "decision";
  slots?: Slot[]; stages?: string[]; autoPublish?: boolean; wantsPhoto?: boolean;
}[] = [
  // ---- Today: the three that cover most days ---------------------------
  {
    key: "on-site-today",
    label: "On site today",
    body: "The {trade} was on site today — good day's work.",
    category: "Today",
    slots: [{ name: "trade", label: "Who was on", options: TRADES }],
    wantsPhoto: true,
  },
  {
    key: "quiet-day",
    label: "Quiet day — nothing to see",
    body: "No work on site today — that's normal at this point in a build. Next up is {next}.",
    category: "Today",
    slots: [
      {
        name: "next",
        label: "What's next",
        options: [
          "the frame delivery", "the concrete pour", "the roof going on",
          "the plumber's first fix", "the electrician's first fix",
          "plastering", "tiling", "cabinetry install", "the next inspection",
        ],
      },
    ],
  },
  {
    key: "rained-out",
    label: "Rained out",
    body:
      "Too wet to work on site today, so the crew stood down. A few wet days are " +
      "part of every build — I'll let you know if it starts to affect the program.",
    category: "Today",
    kind: "weather",
  },

  // ---- Progress --------------------------------------------------------
  {
    key: "good-progress",
    label: "Good progress",
    body: "Solid day on your place — the {trade} got through more than expected.",
    category: "Progress",
    slots: [{ name: "trade", label: "Who", options: TRADES }],
    wantsPhoto: true,
  },
  {
    key: "delivery-arrived",
    label: "Delivery arrived",
    body: "Your {item} arrived on site today.",
    category: "Progress",
    slots: [
      {
        name: "item",
        label: "What arrived",
        options: [
          "frame and trusses", "roof tiles", "bricks", "windows",
          "insulation", "plasterboard", "wall and floor tiles",
          "kitchen cabinetry", "stone benchtops", "doors and skirting",
        ],
      },
    ],
    wantsPhoto: true,
  },
  {
    key: "inspection-booked",
    label: "Inspection booked",
    body:
      "The {inspection} inspection is booked for {when}. Work on that part pauses " +
      "until it's signed off — that's a normal part of every build.",
    category: "Progress",
    slots: [
      {
        name: "inspection",
        label: "Which",
        options: ["footings", "frame", "waterproofing", "stormwater", "final"],
      },
      { name: "when", label: "When", options: NEXT_DAY },
    ],
  },
  {
    key: "inspection-passed",
    label: "Inspection passed",
    body: "Good news — the {inspection} inspection passed today and we're cleared to keep going.",
    category: "Progress",
    kind: "milestone",
    slots: [
      {
        name: "inspection",
        label: "Which",
        options: ["footings", "frame", "waterproofing", "stormwater", "final"],
      },
    ],
  },

  // ---- Held up: these draft, they do not send -------------------------
  {
    key: "waiting-on-supplier",
    label: "Held up — supplier",
    body:
      "We're held up waiting on {item}, now expected {when}. I've been chasing it " +
      "and I'll let you know the moment it lands. I'll tell you straight away if " +
      "this affects your handover.",
    category: "Held up",
    kind: "delay",
    autoPublish: false,
    slots: [
      {
        name: "item",
        label: "What",
        options: [
          "your windows", "the roof tiles", "the frame", "your tiles",
          "the kitchen cabinetry", "your stone benchtops", "tapware and fittings",
          "your front door",
        ],
      },
      { name: "when", label: "Now expected", options: NEXT_DAY },
    ],
  },
  {
    key: "waiting-on-trade",
    label: "Held up — trade",
    body:
      "We've had to move the {trade}'s start to {when}. I'm keeping across it, and " +
      "I'll tell you straight away if it affects your handover.",
    category: "Held up",
    kind: "delay",
    autoPublish: false,
    slots: [
      { name: "trade", label: "Who", options: TRADES },
      { name: "when", label: "Now booked", options: NEXT_DAY },
    ],
  },
  {
    key: "waiting-on-approval",
    label: "Held up — council or certifier",
    body:
      "We're waiting on {what} before the next stage can start. This one is out of " +
      "my hands, but I'm following it up and will update you as soon as I hear.",
    category: "Held up",
    kind: "delay",
    autoPublish: false,
    slots: [
      {
        name: "what",
        label: "What",
        options: [
          "council approval", "the certifier's sign-off", "the engineer's inspection",
          "the occupation certificate", "a service connection",
        ],
      },
    ],
  },
  {
    key: "need-a-decision",
    label: "Need a decision from you",
    body:
      "I need your choice on {item} to keep things moving. If you can let me know " +
      "by {when} it won't hold anything up — after that it starts to push the " +
      "following stage back.",
    category: "Held up",
    kind: "decision",
    slots: [
      {
        name: "item",
        label: "What",
        options: [
          "bathroom tiles", "kitchen tiles", "tapware", "paint colours",
          "flooring", "the front door", "benchtop stone", "external colours",
          "electrical points",
        ],
      },
      { name: "when", label: "By", options: NEXT_DAY },
    ],
  },

  // ---- Milestones: the ones they will screenshot ----------------------
  {
    key: "slab-poured",
    label: "Slab poured",
    body:
      "Your slab went down today. It needs a few days to cure before the frame " +
      "can start — this is the first time the footprint of your house is really " +
      "visible on the block.",
    category: "Milestones",
    kind: "milestone",
    stages: ["footings-slab"],
    wantsPhoto: true,
  },
  {
    key: "frame-up",
    label: "Frame is up",
    body:
      "The frame is up. This is the one everyone waits for — you can walk through " +
      "and stand in your actual rooms for the first time. Worth a visit if you can, " +
      "just let me know so I can meet you there.",
    category: "Milestones",
    kind: "milestone",
    stages: ["frame"],
    wantsPhoto: true,
  },
  {
    key: "roof-on",
    label: "Roof on",
    body: "The roof is on. Your house is under cover now, and everything inside can get underway.",
    category: "Milestones",
    kind: "milestone",
    stages: ["roof"],
    wantsPhoto: true,
  },
  {
    key: "bricks-up",
    label: "Walls are up",
    body:
      "The external walls are finished. From the street it now looks like a house " +
      "rather than a building site — this is usually the biggest visual jump of the " +
      "whole build.",
    category: "Milestones",
    kind: "milestone",
    stages: ["external-walls-brick-cladding-or-render"],
    wantsPhoto: true,
  },
  {
    key: "lockup",
    label: "Lock-up reached",
    body:
      "Windows and external doors are in, so your house is at lock-up — it can be " +
      "properly locked for the first time. Fit-out starts from here.",
    category: "Milestones",
    kind: "milestone",
    stages: ["windows-external-doors"],
    wantsPhoto: true,
  },
  {
    key: "practical-completion",
    label: "Practical completion",
    body:
      "We're at the point where I'd like to walk through the house with you, room " +
      "by room, and list anything that needs attention. Once that's done and the " +
      "occupation certificate is through, we're at handover. Take your time on the " +
      "walk-through — that's what it's for.",
    category: "Milestones",
    kind: "milestone",
    wantsPhoto: true,
  },

  // ---- Money and dates: the whole category that was missing --------------
  //
  // Every one of these drafts rather than sends. They all carry a consequence
  // the owner will react to, and each is a conversation he should have already
  // had — the message is the confirmation, not the announcement.
  {
    key: "handover-moved",
    label: "Handover date has moved",
    body:
      "I want to be straight with you about timing. We're now looking at {month} for handover " +
      "rather than what we last discussed, because of {why}. I know that's not what you wanted " +
      "to hear. Nothing else about the build has changed, and I'll keep you posted as it firms up.",
    category: "Held up",
    kind: "delay",
    autoPublish: false,
    slots: [
      { name: "month", label: "Now looking at", options: MONTHS },
      {
        name: "why",
        label: "Because of",
        options: [
          "a run of wet weather",
          "a supplier delay",
          "waiting on council",
          "waiting on the certifier",
          "what we found once we opened up the site",
          "the variations we've added",
        ],
      },
    ],
  },
  {
    key: "variation-coming",
    label: "That'll be a variation",
    body:
      "That change will be a variation to the contract, so I'll price it and send you the " +
      "paperwork before anyone does anything. Nothing goes ahead until you've signed it off.",
    category: "Held up",
    kind: "message",
    autoPublish: false,
  },
  {
    key: "claim-coming",
    label: "Progress claim coming",
    body:
      "We've reached the {stage} stage, so the progress claim for it will come through shortly. " +
      "If you're drawing on a construction loan it's worth giving your bank a heads-up now — they " +
      "usually want a week or so, and sometimes a valuer's visit.",
    category: "Held up",
    kind: "message",
    autoPublish: false,
    slots: [
      {
        name: "stage",
        label: "Which claim",
        options: ["base", "frame", "lock-up", "fixing", "final"],
      },
    ],
  },
  {
    key: "latent-condition",
    label: "Found something on site",
    body:
      "We've hit {what} on site, which wasn't something the reports picked up. I'm getting advice " +
      "on the best way through it and I'll come back to you with what it means for cost and " +
      "timing before anything goes ahead.",
    category: "Held up",
    kind: "delay",
    autoPublish: false,
    slots: [
      {
        name: "what",
        label: "What",
        options: [
          "rock", "fill that needs removing", "asbestos", "an unmarked service",
          "groundwater", "poor soil",
        ],
      },
    ],
    wantsPhoto: true,
  },
  {
    key: "we-need-from-you",
    label: "Your items due on site",
    body:
      "A reminder that your {item} needs to be on site by {when}, otherwise the fit-off has to " +
      "wait and that pushes everything behind it.",
    category: "Held up",
    kind: "decision",
    slots: [
      {
        name: "item",
        label: "What",
        options: ["appliances", "tapware", "light fittings", "flooring", "bathroom accessories"],
      },
      { name: "when", label: "By", options: NEXT_DAY },
    ],
  },

  // ---- Milestones the owner is actually waiting for ----------------------
  {
    key: "occupation-certificate",
    label: "You can move in",
    body:
      "The occupation certificate has come through, which is the bit that legally lets you move " +
      "in. Everything's signed off. Let's sort out a time for handover and the keys.",
    category: "Milestones",
    kind: "milestone",
  },

  // ---- After handover: the plan said not to go dark here -----------------
  {
    key: "defect-booked",
    label: "Booked a defect in",
    body: "I've booked someone to come back and sort {item} on {when}.",
    category: "Notes",
    kind: "message",
    slots: [
      {
        name: "item",
        label: "What",
        options: [
          "the sticking door", "the paint touch-ups", "the cabinetry adjustment",
          "the tiling", "the shower screen", "the gate", "the plumbing item",
        ],
      },
      { name: "when", label: "When", options: NEXT_DAY },
    ],
  },
  {
    key: "shutdown",
    label: "Christmas shutdown",
    body:
      "The industry shuts down over Christmas, so the site will be quiet from {from} until " +
      "{to}. Everything is secured and this break is already built into your dates — it's not a " +
      "delay. I'll be reachable if anything comes up.",
    category: "Notes",
    kind: "message",
    slots: [
      { name: "from", label: "From", options: ["mid-December", "the week before Christmas"] },
      { name: "to", label: "Back", options: ["mid-January", "late January", "early February"] },
    ],
  },

  // ---- Direct notes ----------------------------------------------------
  {
    key: "site-visit-welcome",
    label: "Invite them to visit",
    body:
      "If you'd like to come and have a look, let me know a time that suits and I'll meet you " +
      "there. Please don't go on site without me — it's an insurance and safety thing rather than " +
      "me being precious. You'll need closed shoes, and I'll bring a hi-vis for you.",
    category: "Notes",
    kind: "message",
  },
  {
    key: "owe-you-a-call",
    label: "I owe you a call",
    body: "I owe you a call — I'll ring you {when}.",
    category: "Notes",
    kind: "message",
    slots: [
      {
        name: "when",
        label: "When",
        options: ["later today", "first thing tomorrow", "tomorrow afternoon", "Monday morning"],
      },
    ],
  },
];

/**
 * The order he reads the groups in, which is the order he needs them.
 * Alphabetically this would be Held up, Milestones, Notes, Progress, Today —
 * putting four delay buttons under his thumb and burying the three that cover
 * most days below a dozen others.
 */
const CATEGORY_ORDER = ["Today", "Progress", "Milestones", "Held up", "Notes"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function seedTemplates(prisma: PrismaClient) {
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    const data = {
      label: t.label,
      body: t.body,
      kind: t.kind ?? ("progress" as const),
      category: t.category,
      categoryPosition: CATEGORY_ORDER.indexOf(t.category) + 1,
      slots: t.slots ? (t.slots as unknown as object) : undefined,
      stageSlugs: t.stages ?? [],
      autoPublish: t.autoPublish ?? true,
      wantsPhoto: t.wantsPhoto ?? false,
      position: i + 1,
    };
    await prisma.messageTemplate.upsert({
      where: { key: t.key },
      update: data,
      create: { key: t.key, ...data },
    });
  }
  console.log(`✓ ${T.length} message templates seeded`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedTemplates(prisma)
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
