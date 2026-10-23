// Shared TypeScript interfaces (client + server). Never include student_id / names in
// anything that is broadcast to peers or the projector — only pseudonyms.

export type Role = "INSTRUCTOR" | "ADVISOR" | "STUDENT" | "ADMIN";
export type PaceSignal = "TOO_FAST" | "CLEAR" | "CONFUSED";
export type SessionStatus = "LIVE" | "EXIT_TICKET" | "ENDED";
export type RiskLevel = "LOW" | "MODERATE" | "CRITICAL";

export interface SlideMetadataDTO {
  pageNumber: number;
  category: string;
  summary: string;
  difficultyLevel: number | null;
  keyTerms: string[];
}

export interface QuestionDTO {
  id: string;
  slidePage: number;
  /** what classmates see: short real name, or a pseudonym when the author hid their name */
  displayPseudonym: string;
  isAnonymous?: boolean;
  polishedContent: string;
  rawContent?: string; // only sent to the author and the instructor
  upvoteCount: number;
  clusterSize: number;
  isPinned: boolean;
  isAnswered: boolean;
  createdAt: string;
  votedByMe?: boolean;
  mine?: boolean;
  variants?: string[]; // merged similar questions (instructor only)
}

export interface Stroke {
  points: [number, number][]; // normalised 0..1
  color: string;
  width: number; // relative to canvas width (e.g. 0.004)
}

export type BoardMode = "SLIDE" | "IDEAS";
/** Board items of the blank Idea Board are stored with slidePage = 0. */
export const IDEA_BOARD_PAGE = 0;

export interface StickyNote {
  id: string;
  likeCount?: number;
  likedByMe?: boolean;
  mine?: boolean;
  createdAt?: string;
  slidePage: number;
  text: string;
  color: StickyColor;
  x: number; // 0..1
  y: number; // 0..1
  displayPseudonym: string;
  isAnonymous?: boolean;
}

export type StickyColor = "amber" | "blue" | "emerald" | "rose";

export interface BoardItemsDTO {
  slidePage: number;
  strokes: (Stroke & { id: string; displayPseudonym: string })[];
  stickies: StickyNote[];
}

export interface PaceStats {
  slidePage: number;
  tooFastPct: number;
  clearPct: number;
  confusedPct: number;
  slideConfusionCount: number;
  total: number;
}

export interface SessionStateDTO {
  sessionId: string;
  sessionCode: string;
  sessionTitle: string;
  status: SessionStatus;
  currentSlidePage: number;
  totalPages: number;
  slideDeckId: string | null;
  slideDeckTitle: string | null;
  isBoardActive: boolean;
  isBoardFrozen: boolean;
  isSilentMode: boolean;
  boardMode: BoardMode;
  boardPrompt: string | null;
  courseCode: string;
  courseName: string;
  activeCount: number;
  metadata: SlideMetadataDTO | null;
  // student-only
  myPseudonym?: string;
  myDisplayName?: string; // label classmates see right now
  myRealName?: string;
  isAnonymous?: boolean;
  myPace?: PaceSignal | null;
  exitTicketSubmitted?: boolean;
}

export interface MuddiestTopic {
  rank: number;
  topic: string;
  percentage: number;
  explanation: string;
  recommendedRecapMins: number;
}

export interface RiskRow {
  studentId: string; // pseudonymised unless CRITICAL
  displayName: string;
  isUnlocked: boolean;
  email?: string;
  advisorEmail?: string | null;
  attendanceRate: number;
  engagementRate: number;
  avgComprehensionRating: number;
  consecutiveLowRatings: number;
  confusionSignalCount: number;
  riskScore: number;
  riskLevel: RiskLevel;
  interventionSentAt: string | null;
}
