// Fast local profanity filter (Thai + English) used before anything is shown to the whole class.
// Kept deliberately small and substring-safe (e.g. no "กู" which also matches "กูเกิล").
const BLOCKLIST = [
  "fuck", "shit", "bitch", "asshole", "cunt", "bastard", "slut", "whore", "nigg",
  "ควย", "เหี้ย", "สัส", "มึง", "เย็ด", "แม่ง", "ไอ้สัตว์", "ชิบหาย", "อีดอก", "ส้นตีน",
];

/** true = text contains blocked words */
export function moderateText(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKLIST.some((w) => lower.includes(w));
}
