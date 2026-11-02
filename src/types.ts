export type MetricPoint = {
  date: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

export type Post = {
  post_id: number;
  competitor_id: number;
  competitor: string;
  handle: string;
  kind: string;
  media_type: 'reel' | 'image' | 'carousel';
  is_collab: boolean;
  paid_partnership: boolean;
  creator: string;
  posted_at: string;
  age_days: number;
  caption: string;
  caption_full: string;
  ig_url: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  reach_unit: string;
  scored: boolean;
  score: number | null;
  outperformance: number | null;
  velocity: number | null;
  engagement: number | null;
  trending: boolean;
  trending_days: number;
  reasons: string[];
  flags: string[];
  not_scored_reason: string;
  status: string;
  snapshot_day: string;
  history: MetricPoint[];
  thumbnail: string | null;
  pipeline: PipelineState;
};

/** How far a post got after trending. Each field is null until that step ran. */
export type PipelineState = {
  teardown: 'pending' | 'done' | 'failed' | null;
  match: string | null; // product code, or "none" when nothing fit
  script: { version: number; status: ScriptStatus } | null;
};

export type Competitor = {
  id: number;
  name: string;
  handle: string;
  followers: number | null;
  active: boolean;
  posts_tracked: number;
  own_posts: number;
  collab_posts: number;
  reels: number;
  scored: number;
  trending: number;
  median_own_reel_views: number | null;
  last_scraped: string | null;
  avatar: string | null;
};

export type Run = {
  run_id: number;
  run_date: string;
  kind: string;
  status: 'running' | 'succeeded' | 'failed' | string;
  started_at: string;
  finished_at: string | null;
  duration_s: number | null;
  new_posts: number | null;
  snapshots: number | null;
  scored: number | null;
  trending: number | null;
  error: string;
};

export type KindFilter = 'all' | 'own' | 'collab';

export type ScriptStatus = 'draft' | 'needs_fix' | 'approved' | 'rejected';

export type ScriptPost = {
  post_id: number;
  competitor_id: number;
  competitor: string;
  handle: string;
  kind: string;
  creator: string;
  caption: string;
  ig_url: string;
  posted_at: string;
  thumbnail: string | null;
  outperformance: number | null;
  trend_score: number | null;
  post_status: string;
};

/** A reel broken down by Prism that has no script yet (the Teardowns tab). */
export type TeardownSummary = ScriptPost & {
  logline: string | null;
  /** matched: a product fits, ready for a script · no_fit: nothing fits · not_matched: not tried yet */
  match: 'matched' | 'no_fit' | 'not_matched';
  product_code: string | null;
  product_name: string | null;
  confidence: number | null;
  teardown_at: string | null;
};

export type ScriptSummary = ScriptPost & {
  script_id: number;
  version: number;
  versions: number;
  status: ScriptStatus;
  title: string;
  product_code: string;
  product_name: string | null;
  blocking: number;
  warnings: number;
  created_at: string | null;
  /** The version in use: the newest approved one, else the newest. */
  active_version: number | null;
};

export type Check = { check: string; severity: 'block' | 'warn'; detail: string };

export type ScriptPart = {
  t_start?: string;
  t_end?: string;
  shot_type?: string;
  visual?: string;
  visual_action?: string;
  dialogue?: string;
  on_screen_text?: string;
  audio_music?: string;
  direction_notes?: string;
  from_original?: 'kept' | 'tweaked' | 'new' | string;
  original_beat?: string;
};

export type ScriptBody = {
  title?: string;
  language?: string;
  duration_seconds?: number;
  concept?: string;
  what_we_kept?: string;
  what_we_changed?: string;
  characters?: { name?: string; description?: string }[];
  hook?: ScriptPart;
  scenes?: ScriptPart[];
  cta?: { line?: string; on_screen_text?: string };
  caption?: string;
  hashtags?: string[];
  music_suggestion?: string;
  disclaimer?: string;
  kept_share?: number;
};

export type ScriptVersion = {
  script_id: number;
  version: number;
  status: ScriptStatus;
  product_code: string;
  sub_product_code: string | null;
  product_name: string | null;
  model: string | null;
  request_note: string | null;
  reviewer: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  /** The version in use: the newest approved one, else the newest. */
  active: boolean;
  checks: Check[];
  created_at: string | null;
  script: ScriptBody;
};

export type Teardown = {
  status: string;
  error: string | null;
  logline: string | null;
  format: string | null;
  tone: string | null;
  themes: string[];
  hook: string | null;
  why_it_worked: string | null;
  pacing: string | null;
  duration: number | null;
  beats: { t_start?: string; t_end?: string; shot_type?: string; visual_action?: string; dialogue?: string; on_screen_text?: string }[];
  transcript: string | null;
};

export type Match = {
  product_code: string | null;
  sub_product_code: string | null;
  product_name: string | null;
  confidence: number;
  reason: string | null;
  topic: string | null;
  customer_need: string | null;
  angle: string | null;
  alternatives: { product_code: string; sub_product_code: string | null; product_name: string | null; confidence: number; reason: string }[];
  model: string | null;
};

export type ScriptReview = {
  post: ScriptPost;
  teardown: Teardown | null;
  match: Match | null;
  versions: ScriptVersion[];
  regenerating: boolean;
  regenerate_error: string | null;
  /** The open request to regenerate the approved version, if there is one. */
  regeneration_request: RegenerationRequest | null;
};

/**
 * Someone asked to regenerate a script that another person approved. The approved version stays
 * in use until its approver says yes (the new version is then written, with `reason` as its note).
 */
export type RegenerationRequest = {
  id: number;
  post_id: number;
  approved_version: number;
  requested_by: string | null;
  reason: string;
  approver: string | null;
  status: 'pending' | 'approved' | 'rejected';
  /** True when it's waiting for the signed-in person to decide. */
  can_decide: boolean;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string | null;
};

export type AuthUser = { email: string; name: string; picture: string };

/** Sign-in state from the API. `enabled` is false while Google sign-in isn't configured. */
export type AuthSession = { enabled: boolean; client_id: string | null; domain: string; user: AuthUser | null };

/** A post in the signal matrix: when it went up and its lift over the brand's usual (null when there's too little history). */
export type MatrixPost = {
  post_id: number;
  competitor_id: number;
  day: string;
  lift: number | null;
  trending: boolean;
  is_collab: boolean;
  caption: string;
  ig_url: string;
};

/** A hand-started teardown → match → script run for one post. */
export type GenerateStep = 'teardown' | 'match' | 'script';
export type GenerateRun = { running: boolean; step: GenerateStep | null; error: string | null };
/** `match` is the picked product and why, shown before anyone asks for the script. */
export type GenerateStatus = GenerateRun & { post_id: number; pipeline: PipelineState; match: Match | null };
