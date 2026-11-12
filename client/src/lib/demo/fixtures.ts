import type { Channel } from "../api";

// Snapshot of public uploads, verified via oEmbed
export type DemoVideo = {
  videoId: string;
  channelId: string;
  title: string;
  hoursAgo: number;
  thumbUrl: string;
  durationSeconds: number | null;
};

// list membership only, the store reads channel data from DEMO_CHANNELS
export type DemoList = { listId: string; name: string; channelIds: string[] };

function thumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

const ALL_ON = { enabledAll: true, enabledLive: true, excludedShorts: true };

export const DEMO_CHANNELS: Channel[] = [
  { channelId: "demo-blender", title: "Blender", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-nasa", title: "NASA", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-kurzgesagt", title: "Kurzgesagt – In a Nutshell", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-veritasium", title: "Veritasium", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-3blue1brown", title: "3Blue1Brown", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-cgp-grey", title: "CGP Grey", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-fireship", title: "Fireship", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-computerphile", title: "Computerphile", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-smarter-every-day", title: "SmarterEveryDay", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-ted-ed", title: "TED-Ed", thumbUrl: null, ...ALL_ON },
  { channelId: "demo-exit-node", title: "exit node", thumbUrl: null, ...ALL_ON },
];

// Durations are only set where measured from the watch page lengthSeconds
export const DEMO_VIDEOS: DemoVideo[] = [
  { videoId: "pvUy69I_Xuk", channelId: "demo-blender", title: "What's New in Blender 5.3! Official Overview", hoursAgo: 2, thumbUrl: thumb("pvUy69I_Xuk"), durationSeconds: null },
  { videoId: "ErAqN6gXqZQ", channelId: "demo-nasa", title: "NASA's SpaceX Crew-13 Mission (Official NASA Trailer)", hoursAgo: 8, thumbUrl: thumb("ErAqN6gXqZQ"), durationSeconds: 62 },
  { videoId: "fEjvSbI_PT4", channelId: "demo-kurzgesagt", title: "What Actually Happens When You Die?", hoursAgo: 13, thumbUrl: thumb("fEjvSbI_PT4"), durationSeconds: null },
  { videoId: "KfODG5REyss", channelId: "demo-veritasium", title: "I finally saw quantum mechanics with my own eyes... (It's spookier than I expected)", hoursAgo: 19, thumbUrl: thumb("KfODG5REyss"), durationSeconds: null },
  { videoId: "LKrwhjOI8Nc", channelId: "demo-3blue1brown", title: "There's never been a better time to go into math", hoursAgo: 24, thumbUrl: thumb("LKrwhjOI8Nc"), durationSeconds: null },
  { videoId: "1K5oDtVAYzk", channelId: "demo-cgp-grey", title: "Your Post Code Is the Directions, Not the Destination", hoursAgo: 30, thumbUrl: thumb("1K5oDtVAYzk"), durationSeconds: null },
  { videoId: "1FurWDiK9A4", channelId: "demo-fireship", title: "Did Anthropic just save its $1 trillion IPO?", hoursAgo: 35, thumbUrl: thumb("1FurWDiK9A4"), durationSeconds: null },
  { videoId: "BmBw827GgFA", channelId: "demo-computerphile", title: "Mutex Explained - Computerphile", hoursAgo: 41, thumbUrl: thumb("BmBw827GgFA"), durationSeconds: null },
  { videoId: "pXypQ6d_iDg", channelId: "demo-smarter-every-day", title: "INSIDE a Nuclear Reactor Core - Smarter Every Day 317", hoursAgo: 46, thumbUrl: thumb("pXypQ6d_iDg"), durationSeconds: null },
  { videoId: "nBVuemyrMgE", channelId: "demo-ted-ed", title: "Is salt the most important ingredient in history? - Carolyn Beans", hoursAgo: 52, thumbUrl: thumb("nBVuemyrMgE"), durationSeconds: null },
  { videoId: "pBJYe1FqK9s", channelId: "demo-exit-node", title: "Stop Calling Yourself a Frontend Engineer (Do This Instead)", hoursAgo: 58, thumbUrl: thumb("pBJYe1FqK9s"), durationSeconds: null },
  { videoId: "mHrHLqQj7Ts", channelId: "demo-blender", title: "Making of: The Blender Open Movies Exhibition", hoursAgo: 63, thumbUrl: thumb("mHrHLqQj7Ts"), durationSeconds: null },
  { videoId: "29ixFQIGZaY", channelId: "demo-nasa", title: "2026 Total Solar Eclipse (Official NASA Trailer)", hoursAgo: 69, thumbUrl: thumb("29ixFQIGZaY"), durationSeconds: 45 },
  { videoId: "5_Fayfx2NUM", channelId: "demo-kurzgesagt", title: "How I Survived Late-Stage Cancer (A Fun Story)", hoursAgo: 74, thumbUrl: thumb("5_Fayfx2NUM"), durationSeconds: null },
  { videoId: "eyZEqSPeMwg", channelId: "demo-veritasium", title: "No device could prove Einstein wrong... until now", hoursAgo: 80, thumbUrl: thumb("eyZEqSPeMwg"), durationSeconds: null },
  { videoId: "Nbwv5wHQoj0", channelId: "demo-3blue1brown", title: "The last IMO problem AI could not solve", hoursAgo: 85, thumbUrl: thumb("Nbwv5wHQoj0"), durationSeconds: null },
  { videoId: "HSRmfNDk87s", channelId: "demo-cgp-grey", title: "Why Runways Have to Be Repainted", hoursAgo: 91, thumbUrl: thumb("HSRmfNDk87s"), durationSeconds: null },
  { videoId: "pf5tXJZM1Rw", channelId: "demo-fireship", title: "OpenAI spent $1.2 million hacking Linux... and it was a bargain", hoursAgo: 97, thumbUrl: thumb("pf5tXJZM1Rw"), durationSeconds: null },
  { videoId: "NDgS__J1U-M", channelId: "demo-computerphile", title: "The Private Key Mistake! (TLS Key set to \"4\") - Computerphile", hoursAgo: 102, thumbUrl: thumb("NDgS__J1U-M"), durationSeconds: null },
  { videoId: "vS6HEes8daw", channelId: "demo-smarter-every-day", title: "The PROBLEM with Capitalism - Smarter Every Day 316", hoursAgo: 108, thumbUrl: thumb("vS6HEes8daw"), durationSeconds: null },
  { videoId: "bw5tzcoEG88", channelId: "demo-ted-ed", title: "How to effectively use visuals in your presentation", hoursAgo: 113, thumbUrl: thumb("bw5tzcoEG88"), durationSeconds: null },
  { videoId: "t3gTCvtUXeE", channelId: "demo-exit-node", title: "When will people realize FEAR OF AI is a TRAP?!", hoursAgo: 119, thumbUrl: thumb("t3gTCvtUXeE"), durationSeconds: null },
  { videoId: "sO_lhW8av3U", channelId: "demo-blender", title: "Blender Conference 2026 Recap", hoursAgo: 124, thumbUrl: thumb("sO_lhW8av3U"), durationSeconds: null },
  { videoId: "3Yqi3D4b2RQ", channelId: "demo-nasa", title: "NASA’s Artemis III Announcement (Official NASA Trailer)", hoursAgo: 130, thumbUrl: thumb("3Yqi3D4b2RQ"), durationSeconds: 46 },
  { videoId: "PXbVn-f_wuM", channelId: "demo-kurzgesagt", title: "You Will Only Like Half of This Video", hoursAgo: 135, thumbUrl: thumb("PXbVn-f_wuM"), durationSeconds: null },
  { videoId: "NiCgcUTL9_Q", channelId: "demo-veritasium", title: "Fiber Optics are so much cooler than I thought", hoursAgo: 141, thumbUrl: thumb("NiCgcUTL9_Q"), durationSeconds: null },
  { videoId: "GlYgs6v2YfU", channelId: "demo-3blue1brown", title: "But what is cross-entropy? | Compression is Intelligence Part 2", hoursAgo: 147, thumbUrl: thumb("GlYgs6v2YfU"), durationSeconds: null },
  { videoId: "58SrtQNt4YE", channelId: "demo-cgp-grey", title: "America Forgot It's Allowed to Stop Making Coins", hoursAgo: 152, thumbUrl: thumb("58SrtQNt4YE"), durationSeconds: null },
  { videoId: "iw9SZgyahqg", channelId: "demo-fireship", title: "The one thing holding theoretical CS together just broke... kinda", hoursAgo: 158, thumbUrl: thumb("iw9SZgyahqg"), durationSeconds: null },
  { videoId: "cI8IquVEyVY", channelId: "demo-computerphile", title: "?PHP Problem? - Computerphile", hoursAgo: 163, thumbUrl: thumb("cI8IquVEyVY"), durationSeconds: null },
  { videoId: "5lCWqEFVzbY", channelId: "demo-smarter-every-day", title: "They Call it \"The Taco Turn\" and it's Genius - Smarter Every Day 315", hoursAgo: 169, thumbUrl: thumb("5lCWqEFVzbY"), durationSeconds: null },
  { videoId: "8EtdC9Bjubk", channelId: "demo-ted-ed", title: "Can you solve the Billy Bonka riddle? - Edwin F. Meyer", hoursAgo: 174, thumbUrl: thumb("8EtdC9Bjubk"), durationSeconds: null },
  { videoId: "i1bE2c-SlcA", channelId: "demo-exit-node", title: "I Gave Claude a Floor Plan. It Shipped a Full Apartment Tour.", hoursAgo: 180, thumbUrl: thumb("i1bE2c-SlcA"), durationSeconds: null },
  { videoId: "6mYP51QcD3Y", channelId: "demo-blender", title: "Practical XR Bridge to Blender Spatial Workflows — BCON26", hoursAgo: 185, thumbUrl: thumb("6mYP51QcD3Y"), durationSeconds: null },
  { videoId: "FkgVB19I6xw", channelId: "demo-nasa", title: "NASA's Roman Space Telescope: A New Perspective on the Cosmos (Official NASA Trailer)", hoursAgo: 191, thumbUrl: thumb("FkgVB19I6xw"), durationSeconds: 46 },
  { videoId: "_y9JuojAIg0", channelId: "demo-kurzgesagt", title: "We Finally Know More About Humanity’s First Civilization", hoursAgo: 197, thumbUrl: thumb("_y9JuojAIg0"), durationSeconds: null },
  { videoId: "ONAuUyml0yI", channelId: "demo-veritasium", title: "We're trying something new...", hoursAgo: 202, thumbUrl: thumb("ONAuUyml0yI"), durationSeconds: null },
  { videoId: "ldxFjLJ3rVY", channelId: "demo-3blue1brown", title: "How (and why) to take a logarithm of an image", hoursAgo: 208, thumbUrl: thumb("ldxFjLJ3rVY"), durationSeconds: null },
  { videoId: "z_7N8MFRJkc", channelId: "demo-cgp-grey", title: "Why I Still Use Paper", hoursAgo: 213, thumbUrl: thumb("z_7N8MFRJkc"), durationSeconds: null },
  { videoId: "k2ruCf_z75I", channelId: "demo-fireship", title: "The worst week in cybersecurity history... so far", hoursAgo: 219, thumbUrl: thumb("k2ruCf_z75I"), durationSeconds: null },
  { videoId: "h6j_ixGnpiY", channelId: "demo-computerphile", title: "How Image Watermarking Works - Computerphile", hoursAgo: 224, thumbUrl: thumb("h6j_ixGnpiY"), durationSeconds: null },
  { videoId: "WtQ64nSbdY4", channelId: "demo-smarter-every-day", title: "What Everyone Sees... But I Don't (The Johari Window) - Smarter Every Day 314", hoursAgo: 230, thumbUrl: thumb("WtQ64nSbdY4"), durationSeconds: null },
  { videoId: "8RPK5KwYhgA", channelId: "demo-ted-ed", title: "What if you didn’t brush your teeth for a year? - Justin Merritt", hoursAgo: 235, thumbUrl: thumb("8RPK5KwYhgA"), durationSeconds: null },
  { videoId: "g8BtqdSeah4", channelId: "demo-exit-node", title: "Learn AI Like This and You'll Be Ahead of Most Engineers.", hoursAgo: 241, thumbUrl: thumb("g8BtqdSeah4"), durationSeconds: null },
  { videoId: "AUmsgsN89iM", channelId: "demo-blender", title: "Vtubing Using EEVEE/Cycles DLSS — BCON26", hoursAgo: 247, thumbUrl: thumb("AUmsgsN89iM"), durationSeconds: null },
  { videoId: "eXrd5sNdacA", channelId: "demo-nasa", title: "MAX POWER: Highlights from NASA’s First-Ever Tech Expo and Air Show", hoursAgo: 252, thumbUrl: thumb("eXrd5sNdacA"), durationSeconds: null },
  { videoId: "ujkD4SxPKOI", channelId: "demo-kurzgesagt", title: "AI Just Crossed the Terrifying Line - Now What?", hoursAgo: 258, thumbUrl: thumb("ujkD4SxPKOI"), durationSeconds: null },
  { videoId: "JsBZOcqZerk", channelId: "demo-veritasium", title: "The Insane Real Engineering of the Nazi Enigma Machine", hoursAgo: 263, thumbUrl: thumb("JsBZOcqZerk"), durationSeconds: null },
  { videoId: "fsLh-NYhOoU", channelId: "demo-3blue1brown", title: "The most beautiful formula not enough people understand", hoursAgo: 269, thumbUrl: thumb("fsLh-NYhOoU"), durationSeconds: null },
  { videoId: "n1KgxqEQn0A", channelId: "demo-cgp-grey", title: "Zero Is Technically an Amount", hoursAgo: 274, thumbUrl: thumb("n1KgxqEQn0A"), durationSeconds: null },
  { videoId: "nEaJMdM1djM", channelId: "demo-fireship", title: "Did the AI bubble just pop?", hoursAgo: 280, thumbUrl: thumb("nEaJMdM1djM"), durationSeconds: null },
  { videoId: "WqrwAFs-fq0", channelId: "demo-computerphile", title: "Multiplayer Gaming & Flight Simulation - Computerphile", hoursAgo: 286, thumbUrl: thumb("WqrwAFs-fq0"), durationSeconds: null },
  { videoId: "-0JKHuzJ67A", channelId: "demo-smarter-every-day", title: "Everything About Disc Golf Aerodynamics - Smarter Every Day 313", hoursAgo: 291, thumbUrl: thumb("-0JKHuzJ67A"), durationSeconds: null },
  { videoId: "nXvKDYRvTno", channelId: "demo-ted-ed", title: "Scary stories to watch in the dark (if you dare…)", hoursAgo: 297, thumbUrl: thumb("nXvKDYRvTno"), durationSeconds: null },
  { videoId: "vJOYvU9acjQ", channelId: "demo-exit-node", title: "How to Make AI Videos for Beginners", hoursAgo: 302, thumbUrl: thumb("vJOYvU9acjQ"), durationSeconds: null },
  { videoId: "TXtDfATbe0M", channelId: "demo-blender", title: "Blender JAM: A Collective Animation Experiment — BCON26", hoursAgo: 308, thumbUrl: thumb("TXtDfATbe0M"), durationSeconds: null },
  { videoId: "Zezt6EsG9WE", channelId: "demo-nasa", title: "NASA Moon Base: Rovers and Lunar Terrain Vehicles (October 2026 Update)", hoursAgo: 313, thumbUrl: thumb("Zezt6EsG9WE"), durationSeconds: null },
  { videoId: "J1WoNuemKOg", channelId: "demo-veritasium", title: "We sent a camera to space to film the solar eclipse", hoursAgo: 319, thumbUrl: thumb("J1WoNuemKOg"), durationSeconds: null },
  { videoId: "BHdbsHFs2P0", channelId: "demo-3blue1brown", title: "Why you can't comb a hairy ball, and why we care", hoursAgo: 324, thumbUrl: thumb("BHdbsHFs2P0"), durationSeconds: null },
  { videoId: "G_em1hHPnXY", channelId: "demo-fireship", title: "China just dropped a new frontier model... and nobody can explain how", hoursAgo: 330, thumbUrl: thumb("G_em1hHPnXY"), durationSeconds: null },
];

// membership order is fixture order, the store sorts by title on read
export const DEMO_LISTS: DemoList[] = [
  {
    listId: "demo-list-space-nerd",
    name: "Space nerd",
    channelIds: ["demo-nasa", "demo-kurzgesagt", "demo-veritasium", "demo-3blue1brown", "demo-smarter-every-day"],
  },
  {
    listId: "demo-list-dev-talk",
    name: "Dev talk",
    channelIds: ["demo-fireship", "demo-computerphile", "demo-exit-node"],
  },
  {
    listId: "demo-list-quick-learning",
    name: "Quick learning",
    channelIds: ["demo-ted-ed", "demo-cgp-grey", "demo-kurzgesagt"],
  },
];
