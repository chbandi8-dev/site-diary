# Saying it out loud

The **Say it** button, bottom right of every staff screen.

He talks; the app works out what he meant; he ticks what he wants; it happens.
Nothing is applied until he ticks it.

## What he can say

One thing or several, in one breath, across more than one house:

> "Lot 114, frame's done and the roof starts Tuesday. Private note — brickie
> still owes me two days. Draft the owners something about the frame going up.
> Yesterday was a wet day at Kellyville Ridge. And new house, 22 Hillcrest
> Avenue Baulkham Hills, double storey, the Rileys."

That is six actions, about fifteen seconds, and around forty taps across six
screens if he did it by hand.

| He says | It proposes |
|---|---|
| "frame's done", "they've started the roof", "slab's not actually poured" | move a stage |
| "private note", "note to self", "don't tell them" | an entry in his own diary — owners never see it |
| "draft the owners…", "tell them…" | an **unsent** update for him to read and send |
| "we're waiting on the windows, Thursday" | what the house is waiting on (owners see this) |
| "next week they're doing…" | the look-ahead that rides Friday's email |
| "yesterday was a wet day" | a day lost to weather, towards an extension of time |
| "the ensuite waste is sitting proud" | a defect on the list |
| "new house, 22 Hillcrest Avenue…" | a house on the books, all 32 standard stages copied |

If he is already on a house's screen, anything he says without naming a house
belongs to that house.

## The three rules

1. **Nothing is applied until he taps.** The interpreter writes nothing at all —
   `lib/assistant.ts` returns a list of proposals, `app/api/pm/assistant`
   returns them to the screen, and only `app/api/pm/assistant/apply` writes.
   Speech recognition mishears Sydney addresses constantly. One untick is the
   whole cost of a mishearing; applied silently it would be a stage marked
   complete on somebody else's build.
2. **An owner-facing message is only ever drafted.** The apply route forces
   `publishedAt: null` on every update it creates, whatever came back from the
   interpreter. There is no flag that makes a dictated message leave the
   building.
3. **Nothing is invented.** A field he did not speak about comes back empty. An
   instruction it cannot place on one of his houses comes back not at all,
   rather than landing on the nearest guess.

The approval screen spells out the house in full — never truncated, never
abbreviated — and marks every action **Owners** or **Only you**, because the
difference between a private note and a message to a homeowner is the entire
reason that screen exists.

## What it needs

`ANTHROPIC_API_KEY`, the same key the add-a-house voice capture already uses.
Without it the button still opens and says so plainly, and every screen it
replaces still works by hand.

Measured cost is a few dollars a month at 25 houses — the note is short, the
reply is short, and it runs on low effort because it is used standing in a
driveway.

## The microphone

The box is an ordinary textarea, and the hint tells him to use the **keyboard's
own microphone**. That is deliberate: on his phone the browser refuses the page
the microphone at a level nothing in the app can fix. The in-page
hold-to-talk button (`components/admin/useDictation.ts`) is offered where it
works and hidden once it has been refused.
