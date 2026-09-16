/**
 * Sydney suburbs, for fixing what the microphone heard.
 *
 * Phone dictation is trained on general English and has no idea it is being
 * spoken to about Western Sydney. "Wentworthville" comes back as "went worth
 * ville", "Toongabbie" as "tune gabby", "Baulkham Hills" as "balcom hills".
 * None of that is a bug in the microphone — the words simply are not in its
 * vocabulary.
 *
 * The fix is not a better microphone, it is context. Given the real names, the
 * write-up can recognise a mangled one for what it is. Weighted heavily toward
 * the north-west and western growth corridors, because that is where new
 * detached housing actually gets built — but broad enough that a job in the
 * inner west or the south is not left as gibberish.
 */

export const SYDNEY_SUBURBS = [
  // North-west growth corridor — the bulk of new detached housing.
  "Kellyville", "North Kellyville", "Kellyville Ridge", "Beaumont Hills",
  "Rouse Hill", "Box Hill", "The Gables", "Nelson", "Annangrove", "Vineyard",
  "Schofields", "The Ponds", "Stanhope Gardens", "Parklea", "Glenwood",
  "Quakers Hill", "Acacia Gardens", "Kings Langley", "Marsden Park",
  "Riverstone", "Colebee", "Glendenning", "Plumpton", "Hassall Grove",
  "Oakhurst", "Ropes Crossing", "Jordan Springs", "Woodcroft", "Doonside",
  // The Hills.
  "Castle Hill", "Baulkham Hills", "Bella Vista", "Norwest", "Winston Hills",
  "Glenhaven", "Dural", "Kenthurst", "Galston", "Cherrybrook",
  "West Pennant Hills", "Pennant Hills", "Carlingford", "Northmead",
  "Old Toongabbie", "Toongabbie", "Seven Hills", "Lalor Park", "Blacktown",
  // Parramatta and around.
  "Parramatta", "North Parramatta", "Harris Park", "Westmead", "Wentworthville",
  "South Wentworthville", "Pendle Hill", "Girraween", "Greystanes",
  "Pemulwuy", "Merrylands", "Guildford", "Granville", "Rydalmere",
  "Dundas", "Telopea", "Ermington", "Rosehill", "Constitution Hill",
  // Penrith and the far west.
  "Penrith", "South Penrith", "Cranebrook", "Werrington", "Kingswood",
  "St Marys", "St Clair", "Erskine Park", "Glenmore Park", "Jamisontown",
  "Emu Plains", "Mount Druitt", "Rooty Hill", "Minchinbury", "Luddenham",
  // Hawkesbury.
  "Windsor", "South Windsor", "Bligh Park", "McGraths Hill", "Mulgrave",
  "Pitt Town", "Richmond", "North Richmond", "Wilberforce", "Glossodia",
  // South-west growth corridor.
  "Oran Park", "Gregory Hills", "Harrington Park", "Narellan", "Camden",
  "Currans Hill", "Mount Annan", "Spring Farm", "Elderslie", "Leppington",
  "Austral", "Edmondson Park", "Catherine Field", "Gledswood Hills",
  "Denham Court", "Bardia", "Liverpool", "Prestons", "Casula", "Moorebank",
  "Hoxton Park", "West Hoxton", "Cecil Hills", "Bonnyrigg", "Green Valley",
  "Campbelltown", "Glen Alpine", "Ambarvale", "Rosemeadow", "Gilead",
  // Inner west and north.
  "Ashfield", "Burwood", "Strathfield", "Concord", "Five Dock", "Drummoyne",
  "Leichhardt", "Marrickville", "Newtown", "Dulwich Hill", "Croydon",
  "Homebush", "Lidcombe", "Auburn", "Ryde", "West Ryde", "Eastwood",
  "Epping", "Macquarie Park", "Chatswood", "Willoughby", "Lane Cove",
  "Hornsby", "Wahroonga", "Turramurra", "St Ives", "Gordon", "Killara",
  "Castle Cove", "Frenchs Forest", "Belrose", "Terrey Hills", "Dee Why",
  "Manly", "Mona Vale", "Narrabeen", "Avalon Beach",
  // East and south.
  "Bondi", "Bondi Junction", "Randwick", "Coogee", "Maroubra", "Mascot",
  "Rosebery", "Alexandria", "Zetland", "Kensington", "Kogarah", "Hurstville",
  "Sans Souci", "Brighton-Le-Sands", "Rockdale", "Sutherland", "Miranda",
  "Caringbah", "Cronulla", "Menai", "Engadine", "Gymea", "Kirrawee",
  "Padstow", "Revesby", "Bankstown", "Panania", "Milperra",
];
