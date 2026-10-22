import { createHmac } from "crypto";

const ADJECTIVES = [
  "Curious", "Silent", "Brave", "Clever", "Gentle", "Swift", "Bright", "Calm", "Witty", "Bold",
  "Happy", "Keen", "Lucky", "Mighty", "Nimble", "Quiet", "Rapid", "Sunny", "Tidy", "Wise",
  "Cosmic", "Daring", "Eager", "Fuzzy", "Golden", "Humble", "Jolly", "Kind", "Lively", "Merry",
  "Noble", "Polite", "Quick", "Royal", "Shiny", "Smart", "Steady", "Vivid", "Zesty", "Agile",
];
const ANIMALS = [
  "Otter", "Falcon", "Panda", "Tiger", "Dolphin", "Koala", "Fox", "Owl", "Lynx", "Heron",
  "Elephant", "Gecko", "Hornbill", "Ibis", "Jaguar", "Kingfisher", "Lemur", "Macaque", "Narwhal", "Orca",
  "Pangolin", "Quokka", "Rhino", "Seal", "Tapir", "Urchin", "Vulture", "Walrus", "Yak", "Zebra",
  "Badger", "Crane", "Deer", "Eagle", "Ferret", "Gibbon", "Hedgehog", "Iguana", "Mantis", "Turtle",
];

const secret = () => process.env.NEXTAUTH_SECRET || "ilecture-pseudonym-secret";

/**
 * Deterministic pseudonym per (sessionId, studentId) via HMAC-SHA256 → "Adjective Animal".
 * Same student keeps the same name for the whole session, but gets a new one next session.
 */
export function generatePseudonym(sessionId: string, studentId: string): string {
  const h = createHmac("sha256", secret()).update(`${sessionId}:${studentId}`).digest();
  const adj = ADJECTIVES[h.readUInt16BE(0) % ADJECTIVES.length];
  const animal = ANIMALS[h.readUInt16BE(2) % ANIMALS.length];
  return `${adj} ${animal}`;
}

export { ANIMAL_EMOJI } from "./animals";
