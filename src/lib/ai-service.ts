import OpenAI from "openai";
import { createHash } from "crypto";
import { env } from "./env";
import type { MuddiestTopic, SlideMetadataDTO } from "@/types";

/**
 * AI service — OpenAI (or any OpenAI-compatible endpoint such as Ollama).
 * Every function has an offline fallback so the platform keeps working when
 * no API key is configured or the provider is down (the lecture must never stall).
 */

const g = globalThis as unknown as { __ilectureOpenAI?: OpenAI | null };
export function aiEnabled() {
  return !!env.openaiKey;
}
function client(): OpenAI | null {
  if (!aiEnabled()) return null;
  if (!g.__ilectureOpenAI) g.__ilectureOpenAI = new OpenAI({ apiKey: env.openaiKey, baseURL: env.openaiBaseUrl, timeout: 12_000, maxRetries: 1 });
  return g.__ilectureOpenAI;
}

export const EMBEDDING_DIMS = 1536;

// ───────────────────────────── 9.1 Academic English Polish ─────────────────────────────
const POLISH_PROMPT = `You are an expert Academic English Editor for university lectures conducted in English (EMI) at Mae Fah Luang University.
Transform student questions (submitted in Thai, broken English, or mixed Thai-English) into clear, polite, and concise academic English questions.
Rules:
1. Preserve exact technical meaning and programming/scientific terms (e.g., malloc, pointer, polymorphism).
2. Remove conversational filler ("อาจารย์ครับ", "uh", "teacher").
3. Output ONLY the polished English question string without quotes or explanations.`;

export async function polishStudentQuestion(raw: string): Promise<{ polished: string; usedAI: boolean }> {
  const text = raw.trim().slice(0, 600);
  const c = client();
  if (c) {
    try {
      const r = await c.chat.completions.create({
        model: env.chatModel,
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          { role: "system", content: POLISH_PROMPT },
          { role: "user", content: text },
        ],
      });
      const out = r.choices[0]?.message?.content?.trim().replace(/^["“]|["”]$/g, "");
      if (out) return { polished: out, usedAI: true };
    } catch (e) {
      console.warn("[ai] polish failed, using fallback:", (e as Error).message);
    }
  }
  return { polished: heuristicPolish(text), usedAI: false };
}

const THAI_FILLERS = [/อาจารย์(ครับ|คะ|ค่ะ)?/g, /(ครับ|คะ|ค่ะ|นะคะ|นะครับ|จ้า|จ้ะ)\b/g, /\bพี่\b/g];
const EN_FILLERS = /\b(uh+|um+|erm|teacher|ajarn|aj\.?|sir|madam|hello|hi|excuse me|sorry|pls|plz|please)\b[,.!]?/gi;
// A tiny Thai→English phrase map so the offline fallback still helps the most common cases.
const THAI_PHRASES: [RegExp, string][] = [
  [/ไม่เข้าใจ(เรื่อง)?/g, "I don't understand "],
  [/คืออะไร/g, " — what is it"],
  [/ต่างกันยังไง|ต่างกันอย่างไร/g, " — what is the difference"],
  [/ทำไม/g, "why "],
  [/ยังไง|อย่างไร/g, " how"],
  [/ช่วยอธิบาย(อีกครั้ง|ใหม่)?/g, "could you explain again "],
  [/ขอตัวอย่าง/g, "could you give an example of "],
  [/ตรงนี้|อันนี้/g, "this part"],
  [/ได้ไหม|ได้มั้ย/g, ""],
  [/และ/g, " and "],
  [/กับ/g, " and "],
];

export function heuristicPolish(raw: string): string {
  let s = raw;
  for (const r of THAI_FILLERS) s = s.replace(r, " ");
  s = s.replace(EN_FILLERS, " ");
  for (const [r, rep] of THAI_PHRASES) s = s.replace(r, rep);
  s = s.replace(/\s+/g, " ").replace(/\s+([?.!,])/g, "$1").trim();
  s = s.replace(/^[-—,\s]+/, "");
  if (!s) return raw.trim();
  s = s.replace(/\bi\b/g, "I");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[?]$/.test(s)) s = s.replace(/[.!]+$/, "") + "?";
  return s;
}

// ───────────────────────────── Moderation ─────────────────────────────
const BLOCKLIST = [
  "fuck", "shit", "bitch", "asshole", "dick", "cunt", "bastard", "slut", "whore", "nigg",
  "ควย", "เหี้ย", "สัส", "มึง", "กู", "เย็ด", "หี", "แม่ง", "ไอ้สัตว์", "ชิบหาย",
];
export async function moderate(text: string): Promise<{ flagged: boolean; reason?: string }> {
  const lower = text.toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return { flagged: true, reason: "profanity" };
  const c = client();
  if (c && !env.openaiBaseUrl) {
    try {
      const r = await c.moderations.create({ model: "omni-moderation-latest", input: text });
      if (r.results[0]?.flagged) return { flagged: true, reason: "moderation" };
    } catch (e) {
      console.warn("[ai] moderation unavailable:", (e as Error).message);
    }
  }
  return { flagged: false };
}

// ───────────────────────────── Embeddings ─────────────────────────────
export async function embed(text: string): Promise<{ vector: number[]; usedAI: boolean }> {
  const c = client();
  if (c) {
    try {
      const r = await c.embeddings.create({ model: env.embeddingModel, input: text.slice(0, 2000) });
      const v = r.data[0]?.embedding;
      if (v && v.length === EMBEDDING_DIMS) return { vector: v, usedAI: true };
      if (v) return { vector: fitDims(v), usedAI: true };
    } catch (e) {
      console.warn("[ai] embedding failed, using fallback:", (e as Error).message);
    }
  }
  return { vector: hashedEmbedding(text), usedAI: false };
}

function fitDims(v: number[]): number[] {
  const out = new Array(EMBEDDING_DIMS).fill(0);
  for (let i = 0; i < v.length; i++) out[i % EMBEDDING_DIMS] += v[i];
  return l2(out);
}
function l2(v: number[]) {
  const n = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map((x) => x / n);
}

const STOP = new Set(
  "a an the is are was were be been of to in on at for and or but with by from as it this that these those what which who how why when where do does did can could would should will i you we they me my your our please explain again about there here not no yes have has had into than then so if just".split(" ")
);
const SYNONYMS: Record<string, string> = {
  ptr: "pointer", pointers: "pointer", "*": "pointer", addr: "address", addresses: "address",
  derefence: "dereference", deref: "dereference", dereferencing: "dereference", "&": "address",
  arrays: "array", functions: "function", func: "function", vars: "variable", var: "variable", variables: "variable",
  mem: "memory", allocate: "malloc", allocation: "malloc", alloc: "malloc", freeing: "free", leak: "leak", leaks: "leak",
  difference: "differ", different: "differ", diff: "differ", vs: "differ", versus: "differ",
  example: "example", examples: "example", eg: "example",
};
function stem(w: string) {
  if (SYNONYMS[w]) return SYNONYMS[w];
  return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
}

/**
 * Offline semantic-ish embedding: hashed bag of normalised words + word bigrams + char trigrams,
 * projected into 1536 dims and L2-normalised. Good enough to merge near-duplicate questions.
 */
export function hashedEmbedding(text: string): number[] {
  const v = new Array(EMBEDDING_DIMS).fill(0);
  const add = (feat: string, w: number) => {
    const h = createHash("md5").update(feat).digest();
    const idx = h.readUInt32BE(0) % EMBEDDING_DIMS;
    const sign = h[4] & 1 ? 1 : -1;
    v[idx] += sign * w;
  };
  const words = text
    .toLowerCase()
    .replace(/([*&])/g, " $1 ")
    .split(/[^a-z0-9_*&฀-๿]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);
  words.forEach((w) => add("w:" + w, 1.0));
  for (let i = 0; i < words.length - 1; i++) add("b:" + words[i] + "_" + words[i + 1], 0.6);
  for (const w of words) for (let i = 0; i < w.length - 2; i++) add("c:" + w.slice(i, i + 3), 0.25);
  return l2(v);
}

export function cosine(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ───────────────────────────── 9.2 Slide Pre-Processor ─────────────────────────────
const SLIDE_PROMPT = `Analyze the following university lecture slide text and return a JSON object with:
{
  "category": "Concept Overview" | "Code Implementation" | "Architecture Diagram" | "Common Pitfalls" | "Summary/Q&A",
  "summary": "1-sentence concise summary of the slide",
  "difficultyLevel": 1 to 5 (integer),
  "keyTerms": ["term1", "term2", "term3"]
}`;
const CATEGORIES = ["Concept Overview", "Code Implementation", "Architecture Diagram", "Common Pitfalls", "Summary/Q&A"];

export async function analyzeSlidePage(pageText: string, pageNumber: number): Promise<SlideMetadataDTO> {
  const c = client();
  if (c && pageText.trim().length > 0) {
    try {
      const r = await c.chat.completions.create({
        model: env.chatModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SLIDE_PROMPT },
          { role: "user", content: pageText.slice(0, 4000) },
        ],
      });
      const j = JSON.parse(r.choices[0]?.message?.content || "{}");
      return {
        pageNumber,
        category: CATEGORIES.includes(j.category) ? j.category : "Concept Overview",
        summary: String(j.summary || "").slice(0, 500) || firstSentence(pageText),
        difficultyLevel: clampInt(j.difficultyLevel, 1, 5, 3),
        keyTerms: Array.isArray(j.keyTerms) ? j.keyTerms.slice(0, 6).map(String) : [],
      };
    } catch (e) {
      console.warn("[ai] slide analysis failed, using fallback:", (e as Error).message);
    }
  }
  return heuristicSlide(pageText, pageNumber);
}

function clampInt(v: unknown, lo: number, hi: number, d: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}
function firstSentence(t: string) {
  const s = t.replace(/\s+/g, " ").trim();
  return (s.split(/(?<=[.!?])\s/)[0] || s).slice(0, 200) || "Slide content";
}
export function heuristicSlide(text: string, pageNumber: number): SlideMetadataDTO {
  const t = text.toLowerCase();
  let category = "Concept Overview";
  if (/(summary|recap|q&a|questions\?|key takeaways)/.test(t)) category = "Summary/Q&A";
  else if (/(pitfall|mistake|common error|warning|avoid|dangling|segfault|bug)/.test(t)) category = "Common Pitfalls";
  else if (/[{};]|#include|int \w+\s*=|printf|def |function |return /.test(text)) category = "Code Implementation";
  else if (/(architecture|diagram|layer|component|flow|stack|heap)/.test(t)) category = "Architecture Diagram";
  const words = (text.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) || []).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w));
  const freq = new Map<string, number>();
  words.forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
  const keyTerms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  const difficulty = Math.min(5, Math.max(1, Math.round(1 + (category === "Code Implementation" ? 2 : 1) + Math.min(2, text.length / 600))));
  return { pageNumber, category, summary: firstSentence(text), difficultyLevel: difficulty, keyTerms };
}

// ───────────────────────────── 9.3 Muddiest Point Aggregator ─────────────────────────────
const MUDDIEST_PROMPT = `You are an AI Learning Analytics Engine. Analyze the list of student "Muddiest Point" exit tickets from today's lecture and group them into the Top 3 most confusing topics.
Return a valid JSON object matching this exact schema:
{
  "topTopics": [
    {
      "rank": 1,
      "topic": "Short topic title (e.g., Dangling Pointers)",
      "percentage": 64,
      "explanation": "1-sentence synthesis of what specifically confused the students.",
      "recommendedRecapMins": 5
    }
  ]
}`;

export async function summarizeMuddiestPoints(points: string[]): Promise<MuddiestTopic[]> {
  const items = points.map((p) => p.trim()).filter((p) => p && !/^(nothing|none|all clear|-)/i.test(p));
  if (items.length === 0) return [];
  const c = client();
  if (c) {
    try {
      const r = await c.chat.completions.create({
        model: env.chatModel,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: MUDDIEST_PROMPT },
          { role: "user", content: items.map((p, i) => `${i + 1}. ${p}`).join("\n").slice(0, 12000) },
        ],
      });
      const j = JSON.parse(r.choices[0]?.message?.content || "{}");
      if (Array.isArray(j.topTopics)) {
        return j.topTopics.slice(0, 3).map((t: Record<string, unknown>, i: number) => ({
          rank: i + 1,
          topic: String(t.topic || "Topic"),
          percentage: clampInt(t.percentage, 0, 100, 0),
          explanation: String(t.explanation || ""),
          recommendedRecapMins: clampInt(t.recommendedRecapMins, 1, 30, 5),
        }));
      }
    } catch (e) {
      console.warn("[ai] muddiest aggregation failed, using fallback:", (e as Error).message);
    }
  }
  return heuristicMuddiest(items);
}

/** Greedy clustering on the offline embedding, then label each cluster by its most frequent terms. */
export function heuristicMuddiest(items: string[]): MuddiestTopic[] {
  const vecs = items.map((t) => hashedEmbedding(t));
  const clusters: { idx: number[]; centroid: number[] }[] = [];
  vecs.forEach((v, i) => {
    let best = -1, bestSim = 0.35;
    clusters.forEach((c, ci) => {
      const s = cosine(v, c.centroid);
      if (s > bestSim) { bestSim = s; best = ci; }
    });
    if (best === -1) clusters.push({ idx: [i], centroid: v });
    else {
      const c = clusters[best];
      c.idx.push(i);
      c.centroid = l2(c.centroid.map((x, k) => x + v[k]));
    }
  });
  clusters.sort((a, b) => b.idx.length - a.idx.length);
  return clusters.slice(0, 3).map((c, i) => {
    const texts = c.idx.map((k) => items[k]);
    const freq = new Map<string, number>();
    texts.join(" ").toLowerCase().split(/[^a-z0-9_฀-๿]+/).filter((w) => w.length > 2 && !STOP.has(w))
      .forEach((w) => freq.set(w, (freq.get(w) || 0) + 1));
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
    const topic = top.length ? top.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" & ") : texts[0].slice(0, 40);
    const pct = Math.round((c.idx.length / items.length) * 100);
    return {
      rank: i + 1,
      topic,
      percentage: pct,
      explanation: `${c.idx.length} student(s) mentioned this, e.g. "${texts[0].slice(0, 90)}".`,
      recommendedRecapMins: Math.min(15, Math.max(2, Math.round(pct / 10))),
    };
  });
}

/** Short topic label for a single exit ticket (stored in muddiest_feedbacks.extracted_topic). */
export function extractTopicLabel(text: string): string | null {
  const t = text.trim();
  if (!t || /^(nothing|none|all clear)/i.test(t)) return null;
  return t.replace(/^slide\s*\d+\s*[:\-–]\s*/i, "").slice(0, 120);
}
