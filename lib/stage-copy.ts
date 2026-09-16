/**
 * What to tell the owner when a stage finishes.
 *
 * Only the stages an owner actually cares about are here, and that omission is
 * the point. "Under-slab plumbing complete" means nothing to someone who has
 * never built a house, and an app that emails them about it teaches them to
 * stop reading — which costs him the one message that mattered.
 *
 * Roughly a dozen moments in a build genuinely land: the slab going down, the
 * frame going up, the roof going on, the house being locked up, the kitchen
 * arriving, practical completion. They are the ones people photograph and send
 * to their parents.
 *
 * Written the way he would say it, and phrased to answer the question that
 * follows every milestone — what happens next — because that is the call he
 * gets otherwise. Nothing here promises a date.
 */
export const STAGE_MILESTONE_COPY: Record<string, string> = {
  "Site handover & pre-start meeting":
    "We've taken over the site and had our pre-start meeting. Things start moving on the block now.",

  "Site establishment & set-out":
    "Fencing, the site toilet and the bin are in, and your block has been set out ready for excavation. The outline you can see pegged out is your house.",

  "Footings & slab":
    "Your slab went down today. It needs a few days to cure before the frame can start — this is the first time the footprint of your house is really visible on the block.",

  Frame:
    "The frame is up. This is the one everyone waits for: you can walk through and stand in your actual rooms for the first time. Worth a visit if you can.",

  Roof:
    "The roof is on and your house is watertight. That's an important one — everything inside can get underway now without the weather holding it up.",

  "External walls: brick, cladding or render":
    "The external walls are finished. From the street it now looks like your house rather than a building site.",

  "Windows & external doors":
    "Windows and external doors are in, so the house is locked up. From here on, work inside carries on regardless of the weather.",

  "Rough-ins: plumbing, electrical & HVAC":
    "The plumbing, wiring and ducting are all run through the walls. Have a look before they're covered up — this is the last chance to see where everything sits.",

  "Wet-area waterproofing":
    "The bathrooms and laundry have been waterproofed and certified. It gets covered over next, so it looks like nothing much, but it's one of the most important steps in the build.",

  "Insulation & internal linings":
    "Insulation and plasterboard are in. The rooms suddenly feel like rooms — walls, ceilings, doorways all where they'll stay.",

  Tiling: "Tiling is finished in the bathrooms and wet areas.",

  "Cabinetry & stone":
    "Your kitchen is in, with the benchtops on. This is usually the moment it starts to feel like your home rather than a house.",

  Painting: "Painting is done throughout.",

  "Fit-off: plumbing, electrical & appliances":
    "Tapware, light fittings, power points and appliances are all in and working. The house is essentially finished now.",

  "Driveway, paths & stormwater": "The driveway, paths and stormwater are in.",

  "Final clean & builder's defect sweep":
    "The house has had its final clean, and we've been through it ourselves listing anything that needs attention before you see it.",

  "Compliance certificates": "All the compliance certificates for your build are in and filed.",

  "Occupation certificate":
    "Your occupation certificate has been issued. That's the formal sign-off that the house is finished and can be lived in.",

  "Pre-handover inspection & defects list":
    "We've done the pre-handover walk-through. Everything noted is on your defects list, and you can follow it being worked through on your page.",

  "Handover & keys": "Handover is done and the keys are yours. Congratulations.",
};

/** Whether finishing this stage is worth telling an owner about at all. */
export function milestoneCopyFor(stageName: string): string | null {
  return STAGE_MILESTONE_COPY[stageName] ?? null;
}
