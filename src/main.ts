import { ergonMotion as motion } from "./motion-kit";

interface Commitment {
  id: string;
  speaker: string;
  quote: string;
  title: string;
  owner: string;
  deadline: string;
  deliverable: string;
  hedges: string[];
  conditional: boolean;
  score: number;
  label: "clear" | "fuzzy" | "vague";
  status: "pending" | "accepted" | "rejected";
  sample?: boolean;
  missing?: string[];
  reasons?: string[];
  ownerConfirmed?: boolean;
}

interface Task {
  id: string;
  commitmentId: string;
  title: string;
  owner: string;
  deadline: string;
  status: "todo" | "doing" | "done";
  quote: string;
  speaker: string;
}

interface Team {
  id: string;
  name: string;
  status: "active" | "previous";
}

interface SavedMeeting {
  id: string;
  title: string;
  date: string;
  transcript: string;
  commitments: Commitment[];
  vagueScore: number;
  createdAt: string;
}

interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  about: string;
  meetingsAttended: string;
  teams: Team[];
  tasks: Task[];
  savedMeetings: SavedMeeting[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY_PROFILES = "ergon_workspace_profiles_v2";
const STORAGE_KEY_ACTIVE_ID = "ergon_active_profile_id_v2";

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T | null => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T[] => [...root.querySelectorAll<T>(s)];

const sampleTranscript = [
  "Aman: Okay team, Avartan registrations open next month. Sponsor list pe kaam karna hai.",
  "Riya: I'll look into the sponsor list, maybe we can reach out to a few companies.",
  "Karan: Poster design kaun karega?",
  "Sneha: I'll do the posters, will share the first draft by Friday.",
  "Aman: Great. Someone should also update the website with the event schedule.",
  "Karan: Haan, dekhte hain. Let's see what time we get.",
  "Riya: Also we need to talk to the college about the auditorium booking, soon.",
  "Aman: Karan, please confirm the auditorium booking with the dean's office by Thursday 5 PM.",
  "Karan: Done, I will do that.",
  "Sneha: And someone needs to send the reminder mail to all volunteers.",
  "Aman: Okay, let's wrap up. Thanks everyone."
].join("\n");

const sampleCommitments: Commitment[] = [
  { id: "sponsor-outreach", speaker: "Riya", quote: "I'll look into the sponsor list, maybe we can reach out to a few companies.", title: "Sponsor list outreach", owner: "Riya", deadline: "", deliverable: "Sponsor list outreach", hedges: ["look into", "maybe"], conditional: false, score: 50, label: "vague", status: "pending", sample: true },
  { id: "poster-draft", speaker: "Sneha", quote: "I'll do the posters, will share the first draft by Friday.", title: "Poster design first draft", owner: "Sneha", deadline: "Friday", deliverable: "Poster design first draft", hedges: [], conditional: false, score: 0, label: "clear", status: "pending", sample: true },
  { id: "website-schedule", speaker: "Aman", quote: "Someone should also update the website with the event schedule.", title: "Website event schedule update", owner: "", deadline: "", deliverable: "Website event schedule update", hedges: [], conditional: false, score: 60, label: "vague", status: "pending", sample: true },
  { id: "auditorium-booking", speaker: "Aman", quote: "Karan, please confirm the auditorium booking with the dean's office by Thursday 5 PM.", title: "Auditorium booking confirmation", owner: "Karan", deadline: "Thursday 5 PM", deliverable: "Auditorium booking confirmation", hedges: [], conditional: false, score: 0, label: "clear", status: "pending", sample: true },
  { id: "volunteer-reminder", speaker: "Sneha", quote: "And someone needs to send the reminder mail to all volunteers.", title: "Volunteer reminder mail", owner: "", deadline: "", deliverable: "Volunteer reminder mail", hedges: [], conditional: false, score: 60, label: "vague", status: "pending", sample: true }
];

// Active State
let profiles: UserProfile[] = [];
let activeProfile: UserProfile;

const state = {
  view: "profile",
  transcript: "",
  sample: false,
  commitments: [] as Commitment[],
  debtBefore: null as number | null,
  lastDebt: null as number | null,
  isAnalyzed: false,
  sourceLabel: "Awaiting transcript"
};

const nodes = {
  get transcriptInput() { return $<HTMLTextAreaElement>("#transcript-input")!; },
  get file() { return $<HTMLInputElement>("#transcript-file")!; },
  get title() { return $<HTMLInputElement>("#meeting-title")!; },
  get date() { return $<HTMLInputElement>("#meeting-date")!; },
  get charCount() { return $("#char-count")!; },
  get sourceState() { return $("#source-state")!; },
  get message() { return $("#analysis-message")!; },
  get analyze() { return $<HTMLButtonElement>("#analyze-button")!; },
  get progress() { return $("#progress-wrap")!; },
  get progressFill() { return $("#progress-fill")!; },
  get progressLabel() { return $("#progress-label")!; },
  get results() { return $("#transcript-results")!; },
  get transcriptScroll() { return $("#transcript-scroll")!; },
  get inspector() { return $("#inspector-list")!; },
  get inspectorTotal() { return $("#inspector-total")!; },
  get emptyResults() { return $("#empty-results")!; },
  get analysisMode() { return $("#analysis-mode")!; },
  get minimap() { return $("#minimap-track")!; },
  get viewport() { return $("#minimap-viewport")!; },
  get toast() { return $("#toast-region")!; }
};

// Persistence functions
function initProfilesStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      profiles = JSON.parse(raw);
      if (Array.isArray(profiles)) {
        profiles.forEach(p => {
          if (!p.tasks) p.tasks = [];
          if (!p.teams) p.teams = [];
          if (!p.savedMeetings) p.savedMeetings = [];
        });
      } else {
        profiles = [];
      }
    }
  } catch {
    profiles = [];
  }

  if (!profiles.length) {
    const seedProfile: UserProfile = {
      id: "profile-default",
      name: "Vedant Mahant",
      role: "Product Lead",
      email: "vedantmahant159@gmail.com",
      about: "Leading product execution, clarity heuristics, and engineering syncs.",
      meetingsAttended: "8",
      teams: [
        { id: "team-1", name: "Core Product Guild", status: "active" },
        { id: "team-2", name: "Engineering Architecture", status: "active" },
        { id: "team-3", name: "Avartan Operations", status: "previous" }
      ],
      tasks: [
        { id: "task-p1", commitmentId: "auditorium-booking", title: "Auditorium booking confirmation", owner: "Karan", deadline: "Thursday 5 PM", status: "doing", quote: "Karan, please confirm the auditorium booking with the dean's office by Thursday 5 PM.", speaker: "Aman" },
        { id: "task-p2", commitmentId: "poster-draft", title: "Poster design first draft", owner: "Sneha", deadline: "Friday", status: "todo", quote: "I'll do the posters, will share the first draft by Friday.", speaker: "Sneha" },
        { id: "task-p3", commitmentId: "sponsor-outreach", title: "Sponsor list outreach", owner: "Riya", deadline: "2026-10-18", status: "done", quote: "I'll look into the sponsor list, maybe we can reach out to a few companies.", speaker: "Riya" }
      ],
      savedMeetings: [
        {
          id: "meeting-seed-1",
          title: "Avartan Planning Sync — Example",
          date: "2026-10-14",
          transcript: sampleTranscript,
          commitments: sampleCommitments,
          vagueScore: 34,
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    profiles = [seedProfile];
    activeProfile = seedProfile;
    saveProfilesToStorage();
  } else {
    const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    activeProfile = profiles.find(p => p.id === activeId) || profiles[0];
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProfile.id);
  }
}

function saveProfilesToStorage() {
  try {
    if (!activeProfile && profiles.length) {
      activeProfile = profiles[0];
    }
    if (activeProfile) {
      activeProfile.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProfile.id);
    }
    localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles));
    const saveIndicator = $("#profile-save-text");
    if (saveIndicator) {
      saveIndicator.textContent = "Profile saved at " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
  } catch (e) {
    console.error("Storage save failed", e);
  }
}

function switchActiveProfile(profileId: string) {
  const target = profiles.find(p => p.id === profileId);
  if (!target || target.id === activeProfile.id) return;
  activeProfile = target;
  localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeProfile.id);
  renderTopbarProfile();
  renderAll({ animateDebt: true });
  toast("Switched to workspace profile: " + activeProfile.name, "success");
}

function createNewProfile(name: string, role: string, email: string) {
  const newProfile: UserProfile = {
    id: "profile-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: name.trim() || "New Workspace Profile",
    role: role.trim() || "Team Member",
    email: email.trim(),
    about: "",
    meetingsAttended: "0",
    teams: [{ id: "team-" + Date.now(), name: "General Workspace", status: "active" }],
    tasks: [],
    savedMeetings: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  profiles.push(newProfile);
  activeProfile = newProfile;
  saveProfilesToStorage();
  renderTopbarProfile();
  renderAll({ animateDebt: true });
  toast("Created new workspace profile: " + newProfile.name, "success");
}

function renderTopbarProfile() {
  const avatar = $("#topbar-avatar");
  const nameLabel = $("#topbar-name");
  const initials = activeProfile.name.trim()
    ? activeProfile.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
    : "PR";
  if (avatar) avatar.textContent = initials;
  if (nameLabel) nameLabel.textContent = activeProfile.name || "Profile";

  const list = $("#profile-options-list");
  if (!list) return;
  list.replaceChildren();

  profiles.forEach(p => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "profile-option-item" + (p.id === activeProfile.id ? " is-active" : "");
    item.dataset.profileId = p.id;

    const info = document.createElement("div");
    info.className = "profile-option-info";
    const name = document.createElement("span");
    name.className = "profile-option-name";
    name.textContent = p.name || "Unnamed Profile";
    const role = document.createElement("span");
    role.className = "profile-option-role";
    role.textContent = p.role + (p.email ? " · " + p.email : "");
    info.append(name, role);

    item.append(info);
    if (p.id === activeProfile.id) {
      const check = document.createElement("span");
      check.className = "profile-option-check";
      check.textContent = "✓";
      item.append(check);
    }

    item.addEventListener("click", () => {
      switchActiveProfile(p.id);
      $("#profile-dropdown-menu")!.hidden = true;
      $("#profile-switch-btn")!.setAttribute("aria-expanded", "false");
    });

    list.append(item);
  });
}

function displayLabel(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function genericOwner(value: string) {
  return !value.trim() || /^(we|someone|somebody|team|everyone|anyone|koi|sab)$/i.test(value.trim());
}

function calculateScore(c: Partial<Commitment>): { score: number; label: "clear" | "fuzzy" | "vague"; missing: string[]; reasons: string[] } {
  let score = 0;
  const missing: string[] = [];
  const reasons: string[] = [];
  if (genericOwner(c.owner || "")) {
    score += 30;
    missing.push("Owner");
    reasons.push("Owner is missing or not specific");
  }
  if (!String(c.deadline || "").trim() || /^(soon|sometime|later|asap|baad mein|dekhte hain)$/i.test(String(c.deadline || "").trim())) {
    score += 30;
    missing.push("Deadline");
    reasons.push("Deadline is missing or vague");
  }
  const words = String(c.deliverable || "").trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length < 2) {
    score += 20;
    missing.push("Deliverable");
    reasons.push("Deliverable needs a specific outcome");
  }
  if ((c.hedges || []).length) {
    score += 20;
    reasons.push("Hedge language: " + (c.hedges || []).join(", "));
  }
  score = Math.min(score, 100);
  const label: "clear" | "fuzzy" | "vague" = score <= 15 ? "clear" : score <= 45 ? "fuzzy" : "vague";
  return { score, label, missing, reasons };
}

function refreshScore(c: Commitment) {
  Object.assign(c, calculateScore(c));
}

function debtNow() {
  const live = state.commitments.filter(c => c.status !== "rejected");
  return live.length ? Math.round(live.reduce((sum, c) => sum + calculateScore(c).score, 0) / live.length) : 0;
}

function toast(message: string, type: "info" | "success" | "error" = "info") {
  const el = document.createElement("div");
  el.className = "toast " + type;
  const dot = document.createElement("span");
  dot.className = "toast-mark";
  const text = document.createElement("span");
  text.textContent = message;
  el.append(dot, text);
  nodes.toast.append(el);
  motion.toastElement(el);
}

function bindMotion(scope: Element | Document = document) {
  motion.bindControls(scope);
}

function setSourceLabel(text: string) {
  state.sourceLabel = text;
  nodes.sourceState.textContent = text;
}

function syncInput() {
  state.transcript = nodes.transcriptInput.value;
  nodes.charCount.textContent = state.transcript.length.toLocaleString() + " characters";
  if (state.isAnalyzed) {
    state.isAnalyzed = false;
    state.commitments = [];
    state.debtBefore = null;
    state.lastDebt = null;
    renderAll();
  }
  if (state.transcript.trim()) {
    setSourceLabel(state.sample ? "Example Transcript" : "Active Transcript");
  } else {
    setSourceLabel("Awaiting transcript");
  }
}

function parseLocalTranscript(text: string): Commitment[] {
  const turns = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^WEBVTT$/i.test(line) && !/^\d+$/.test(line) && !/\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(line));
  const found: Commitment[] = [];
  for (const line of turns) {
    const match = line.match(/^([^:]{1,48}):\s*(.+)$/);
    if (!match) continue;
    const speaker = match[1].trim(),
      body = match[2].trim();
    if (/\?\s*$/.test(body) || /\b(can't|cannot|won't|already|sent|finished|completed)\b/i.test(body)) continue;
    if (!/\b(i['’]?ll|i will|we will|will|should|need to|needs to|please|kar dunga|kar dungi|bhej dunga|bhej dungi)\b/i.test(body)) continue;
    const hedges = [...body.matchAll(/\b(maybe|try|look into|let'?s see|soon|later|dekhte hain|dekh lunga|shayad)\b/gi)].map(m => m[0].toLowerCase());
    let owner = speaker;
    if (/\b(someone|somebody|anyone|team|everyone|koi|sab)\b/i.test(body)) owner = "";
    const assigned = body.match(/^([A-Z][a-z]+)\s+will\b/);
    if (assigned) owner = assigned[1];
    let deadline = "";
    const dateMatch = body.match(/\bby\s+([^,.!?]+?)(?:[,.!?]|$)/i);
    if (dateMatch) deadline = dateMatch[1].trim();
    let deliverable = body.replace(/^(?:and\s+)?(?:i['’]?ll|i will|we will|someone should|someone needs to|please|[A-Z][a-z]+ will|will|should|need to|needs to)\s*/i, "");
    deliverable = deliverable
      .replace(/\bby\s+[^,.!?]+/i, "")
      .replace(/\b(maybe|try|look into|let'?s see|soon|later|dekhte hain|shayad)\b/gi, "")
      .replace(/[,.!?]+$/g, "")
      .trim();
    if (deliverable.length > 110) deliverable = deliverable.slice(0, 110).trim();
    const title = deliverable ? deliverable.charAt(0).toUpperCase() + deliverable.slice(1) : "Unspecified deliverable";
    const c: Commitment = {
      id: "local-" + found.length + "-" + Math.random().toString(36).slice(2, 7),
      speaker,
      quote: body,
      title,
      owner,
      deadline,
      deliverable,
      hedges,
      conditional: /^if\b/i.test(body),
      status: "pending",
      sample: false,
      score: 0,
      label: "vague"
    };
    refreshScore(c);
    found.push(c);
  }
  return found;
}

function setProgress(value: number, label: string) {
  nodes.progress.hidden = false;
  nodes.progressLabel.textContent = label;
  motion.progress(nodes.progressFill, value);
}

function analyzeTranscript() {
  const text = nodes.transcriptInput.value.trim();
  if (!text) {
    nodes.message.textContent = "Add a transcript before starting a review.";
    toast("Add a transcript first.", "error");
    nodes.transcriptInput.focus();
    return;
  }
  nodes.message.textContent = "Analyzing transcript commitments…";
  nodes.analyze.disabled = true;
  nodes.analyze.querySelector("span")!.textContent = "Extracting promises";
  nodes.progress.hidden = false;
  setProgress(0.06, "Reading transcript");
  let p = 0.06;
  const steps = ["Parsing conversational turns", "Evaluating SMART criteria & hedge words", "Calculating clarity metrics"];
  const stepTimer = setInterval(() => {
    p = Math.min(0.94, p + 0.22);
    setProgress(p, steps[Math.min(2, Math.floor(p * 3))]);
  }, 120);
  setTimeout(() => {
    clearInterval(stepTimer);
    state.commitments = state.sample ? sampleCommitments.map(c => ({ ...c, hedges: [...c.hedges], status: "pending" })) : parseLocalTranscript(text);
    state.isAnalyzed = true;
    state.debtBefore = state.commitments.length ? Math.round(state.commitments.reduce((sum, c) => sum + calculateScore(c).score, 0) / state.commitments.length) : 0;
    state.lastDebt = null;
    setProgress(1, "Review ready");
    setTimeout(() => {
      nodes.progress.hidden = true;
      nodes.analyze.disabled = false;
      nodes.analyze.querySelector("span")!.textContent = "Review commitments";
      nodes.message.textContent = state.sample ? "Sample meeting loaded. Commitments ready for inspection." : "Commitments extracted with SMART heuristics.";
      nodes.analysisMode.textContent = state.sample ? "EXAMPLE TRANSCRIPT" : "COMMITMENT ENGINE ACTIVE";
      renderAll();
      if (!state.commitments.length) toast("No commitment lines found. Check speaker names and wording.", "error");
      else toast(state.commitments.length + " commitment" + (state.commitments.length === 1 ? "" : "s") + " ready to review.", "success");
    }, 160);
  }, 500);
}

function statusClass(label: string) {
  return "hl-" + label;
}

function renderTranscript() {
  nodes.transcriptScroll.replaceChildren();
  nodes.minimap.replaceChildren();
  const lines = state.transcript.split(/\r?\n/);
  const active = state.commitments.filter(c => c.status !== "rejected");
  lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "turn";
    row.id = "turn-" + index;
    const match = line.match(/^([^:]{1,48}):\s*(.*)$/);
    const speaker = document.createElement("span");
    speaker.className = "speaker-label";
    speaker.textContent = match ? match[1].trim() : "Transcript";
    const copy = document.createElement("span");
    copy.className = "turn-copy";
    const body = match ? match[2] : line;
    const matches = active
      .map(c => ({ c, at: body.indexOf(c.quote) }))
      .filter(x => x.at >= 0)
      .sort((a, b) => a.at - b.at);
    let pos = 0;
    for (const item of matches) {
      if (item.at < pos) continue;
      copy.append(document.createTextNode(body.slice(pos, item.at)));
      const result = calculateScore(item.c);
      const mark = document.createElement("span");
      mark.className = "promise-mark " + statusClass(result.label);
      mark.dataset.id = item.c.id;
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      mark.setAttribute("aria-label", displayLabel(result.label) + " promise, score " + result.score + ". Jump to inspector.");
      const fill = document.createElement("i");
      fill.className = "hl-fill";
      fill.setAttribute("aria-hidden", "true");
      mark.append(fill, document.createTextNode(item.c.quote));
      const badge = document.createElement("span");
      badge.className = "mark-label";
      badge.textContent = displayLabel(result.label);
      mark.append(badge);
      copy.append(mark);
      pos = item.at + item.c.quote.length;
    }
    copy.append(document.createTextNode(body.slice(pos)));
    row.append(speaker, copy);
    nodes.transcriptScroll.append(row);
  });
  active.forEach((c, i) => {
    const mark = $<HTMLElement>('.promise-mark[data-id="' + CSS.escape(c.id) + '"]', nodes.transcriptScroll);
    if (!mark) return;
    const t = document.createElement("i");
    t.className = "minimap-tick " + statusClass(calculateScore(c).label);
    t.style.top = Math.max(1, Math.min(99, (mark.closest<HTMLElement>(".turn")!.offsetTop / nodes.transcriptScroll.scrollHeight) * 100)) + "%";
    t.title = displayLabel(calculateScore(c).label) + " promise " + (i + 1);
    nodes.minimap.append(t);
  });
  motion.sweep($$(".promise-mark", nodes.transcriptScroll));
  motion.syncMinimap(nodes.transcriptScroll, nodes.viewport);
  nodes.transcriptScroll.onscroll = () => {
    const max = nodes.transcriptScroll.scrollHeight - nodes.transcriptScroll.clientHeight;
    const pct = max > 0 ? nodes.transcriptScroll.scrollTop / max : 0;
    nodes.viewport.style.transform = "translateY(" + pct * Math.max(0, nodes.transcriptScroll.clientHeight - 22) + "px)";
  };
}

function makeChip(text: string, className = "") {
  const chip = document.createElement("span");
  chip.className = "slot-chip " + className;
  chip.textContent = text;
  return chip;
}

function makePromiseCard(c: Commitment, index: number) {
  const card = document.createElement("article");
  card.className = "promise-card" + (c.status === "accepted" ? " is-resolved" : "");
  card.dataset.id = c.id;
  card.dataset.label = calculateScore(c).label;
  card.innerHTML =
    '<div class="promise-top"><div class="gauge-wrap"><svg class="gauge" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="14"/><circle class="gauge-value" cx="18" cy="18" r="14"/></svg><span class="gauge-score">0</span></div><div class="promise-heading"><h4></h4><span class="risk-label"></span></div><span class="card-index mono"></span></div><blockquote class="promise-quote"></blockquote><div class="score-evidence"></div><div class="slot-chips"></div><div class="promise-fields"><label>OWNER<input data-field="owner" type="text" autocomplete="off" /></label><label>DEADLINE<input data-field="deadline" type="text" autocomplete="off" /></label><label class="deliverable-field">DELIVERABLE<input data-field="deliverable" type="text" autocomplete="off" /></label></div><div class="card-actions"><p class="clarity-hint"></p><div class="action-buttons"><button class="reject-button text-button" data-action="reject" type="button">Reject</button><button class="accept-button" data-action="accept" type="button">Approve</button></div></div>';
  $("h4", card)!.textContent = c.title;
  $(".promise-quote", card)!.textContent = "“" + c.quote + "”";
  $(".card-index", card)!.textContent = String(index + 1).padStart(2, "0");
  for (const input of $$<HTMLInputElement>("[data-field]", card)) {
    const field = input.dataset.field as "owner" | "deadline" | "deliverable";
    input.value = c[field] || "";
    input.placeholder = field === "owner" ? "Name" : field === "deadline" ? "Add a date or time" : "What will be delivered";
    input.disabled = c.status === "accepted";
  }
  const actions = $(".action-buttons", card)!;
  const hint = $(".clarity-hint", card)!;
  if (c.status === "accepted") {
    actions.replaceChildren();
    const label = document.createElement("span");
    label.className = "accepted-note";
    label.textContent = "APPROVED · SAVED TO BOARD";
    actions.append(label);
    hint.textContent = "Synced to active workspace board.";
  } else {
    hint.textContent = "Confirm before it moves to task board.";
  }
  updateCardVisual(c, card);
  return card;
}

function updateCardVisual(c: Commitment, card?: HTMLElement | null) {
  if (!card) card = $<HTMLElement>('.promise-card[data-id="' + CSS.escape(c.id) + '"]', nodes.inspector);
  if (!card) return;
  const result = calculateScore(c);
  Object.assign(c, result);
  card.dataset.label = result.label;
  const scoreText = $(".gauge-score", card)!;
  const priorScore = Number(scoreText.textContent) || 0;
  motion.countTo(scoreText, priorScore, result.score, { duration: 0.32 });
  const path = (card.querySelector(".gauge-value") as SVGGeometryElement | null);
  const circ = 2 * Math.PI * 14;
  if (path) {
    path.style.strokeDasharray = String(circ);
    motion.gauge(path, result.score);
  }
  const risk = $(".risk-label", card)!;
  risk.textContent = displayLabel(result.label);
  risk.className = "risk-label " + result.label;
  const evidence = $(".score-evidence", card)!;
  evidence.replaceChildren();
  if (result.reasons.length) {
    const lead = document.createElement("strong");
    lead.textContent = "Why this score";
    evidence.append(lead);
    for (const reason of result.reasons) {
      const line = document.createElement("span");
      line.textContent = "+ " + reason;
      evidence.append(line);
    }
  } else {
    const ok = document.createElement("span");
    ok.textContent = "Owner, deadline and deliverable are specific; no hedge detected.";
    evidence.append(ok);
  }
  const chips = $(".slot-chips", card)!;
  chips.replaceChildren();
  for (const slot of ["Owner", "Deadline", "Deliverable"]) {
    chips.append(makeChip((result.missing.includes(slot) ? "Missing · " : "") + slot, result.missing.includes(slot) ? "missing" : ""));
  }
  if (c.conditional) chips.append(makeChip("Conditional", "conditional"));
  if (c.ownerConfirmed === false) chips.append(makeChip("Owner not acknowledged", "unconfirmed"));
  const mark = $<HTMLElement>('.promise-mark[data-id="' + CSS.escape(c.id) + '"]', nodes.transcriptScroll);
  if (mark) {
    mark.className = "promise-mark " + statusClass(result.label);
    const fill = $(".hl-fill", mark) as HTMLElement | null;
    if (fill) fill.style.background = "var(--" + result.label + "-tint)";
    const label = $(".mark-label", mark);
    if (label) label.textContent = displayLabel(result.label);
    mark.setAttribute("aria-label", displayLabel(result.label) + " promise, score " + result.score + ". Jump to inspector.");
  }
}

function renderInspector() {
  nodes.inspector.replaceChildren();
  const active = state.commitments.filter(c => c.status !== "rejected").sort((a, b) => calculateScore(b).score - calculateScore(a).score);
  nodes.inspectorTotal.textContent = String(active.length).padStart(2, "0");
  if (!state.isAnalyzed || !active.length) {
    const empty = document.createElement("div");
    empty.className = "inspector-empty";
    const rule = document.createElement("span");
    rule.className = "empty-rule";
    const p = document.createElement("p");
    p.textContent = state.isAnalyzed ? "No promises to review." : "Your promises will appear here after review.";
    const mono = document.createElement("span");
    mono.className = "mono";
    mono.textContent = "OWNER · DEADLINE · DELIVERABLE";
    empty.append(rule, p, mono);
    nodes.inspector.append(empty);
    return;
  }
  active.forEach((c, index) => nodes.inspector.append(makePromiseCard(c, index)));
  bindMotion(nodes.inspector);
  motion.reveal($$(".promise-card", nodes.inspector));
}

function updateCounters() {
  const pending = state.commitments.filter(c => c.status === "pending").length;
  $("#review-count")!.textContent = state.isAnalyzed ? String(pending) : "—";
  $("#board-count")!.textContent = String(activeProfile.tasks.length);
}

function renderTranscriptArea() {
  nodes.results.hidden = !state.isAnalyzed;
  nodes.emptyResults.hidden = !(state.isAnalyzed && !state.commitments.length);
  if (state.isAnalyzed && state.commitments.length) renderTranscript();
  else {
    nodes.transcriptScroll.replaceChildren();
    nodes.minimap.replaceChildren();
  }
}

function renderSavedMeetings() {
  const container = $("#saved-meetings-grid");
  const countLabel = $("#saved-meetings-count");
  if (!container) return;
  container.replaceChildren();

  const meetings = activeProfile.savedMeetings || [];
  if (countLabel) {
    countLabel.textContent = meetings.length + " SAVED MEETING" + (meetings.length === 1 ? "" : "S");
  }

  if (!meetings.length) {
    const empty = document.createElement("p");
    empty.className = "team-empty";
    empty.textContent = 'No saved meetings in this profile yet. Complete a review and click "Save Meeting to Profile" to archive it.';
    container.append(empty);
    return;
  }

  meetings.forEach(m => {
    const card = document.createElement("div");
    card.className = "saved-meeting-card";

    const header = document.createElement("div");
    header.className = "saved-meeting-header";
    const title = document.createElement("h4");
    title.className = "saved-meeting-title";
    title.textContent = m.title || "Untitled Meeting";
    header.append(title);

    const meta = document.createElement("div");
    meta.className = "saved-meeting-meta";
    meta.innerHTML = `<span><b>Date:</b> ${m.date || "Unspecified"}</span><span><b>Score:</b> ${m.vagueScore}</span><span><b>Promises:</b> ${m.commitments.length}</span>`;

    const actions = document.createElement("div");
    actions.className = "saved-meeting-actions";
    const loadBtn = document.createElement("button");
    loadBtn.className = "button-primary";
    loadBtn.style.minHeight = "30px";
    loadBtn.style.padding = "0 10px";
    loadBtn.style.fontSize = "11px";
    loadBtn.textContent = "Load into Review";
    loadBtn.addEventListener("click", () => {
      loadSavedMeetingIntoReview(m);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "text-button danger-link";
    delBtn.style.fontSize = "11px";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => {
      activeProfile.savedMeetings = activeProfile.savedMeetings.filter(item => item.id !== m.id);
      saveProfilesToStorage();
      renderSavedMeetings();
      toast("Meeting deleted from profile archive.", "info");
    });

    actions.append(loadBtn, delBtn);
    card.append(header, meta, actions);
    container.append(card);
  });
}

function loadSavedMeetingIntoReview(m: SavedMeeting) {
  nodes.transcriptInput.value = m.transcript;
  nodes.title.value = m.title;
  nodes.date.value = m.date;
  state.transcript = m.transcript;
  state.sample = false;
  state.commitments = m.commitments.map(c => ({ ...c }));
  state.isAnalyzed = true;
  state.debtBefore = m.vagueScore;
  state.lastDebt = null;
  setSourceLabel("Loaded from Profile Archive");
  switchView("review");
  renderAll();
  toast("Loaded archived meeting: " + m.title, "success");
}

function saveCurrentMeetingToProfile() {
  if (!state.transcript.trim()) {
    toast("No transcript content to save.", "error");
    return;
  }
  const title = nodes.title.value.trim() || "Meeting on " + new Date().toLocaleDateString();
  const date = nodes.date.value || new Date().toISOString().slice(0, 10);
  const score = state.commitments.length ? Math.round(state.commitments.reduce((acc, c) => acc + calculateScore(c).score, 0) / state.commitments.length) : 0;

  const meetingRecord: SavedMeeting = {
    id: "meeting-" + Date.now(),
    title,
    date,
    transcript: state.transcript,
    commitments: state.commitments.map(c => ({ ...c })),
    vagueScore: score,
    createdAt: new Date().toISOString()
  };

  if (!activeProfile.savedMeetings) activeProfile.savedMeetings = [];
  activeProfile.savedMeetings.unshift(meetingRecord);

  // Increment meetings attended
  const currentAttended = parseInt(activeProfile.meetingsAttended, 10) || 0;
  activeProfile.meetingsAttended = String(currentAttended + 1);

  saveProfilesToStorage();
  renderSavedMeetings();
  renderProfile();
  toast("Meeting successfully archived to " + activeProfile.name + " profile!", "success");
}

function renderProfile() {
  const nameField = $<HTMLInputElement>("#profile-name")!;
  const roleField = $<HTMLInputElement>("#profile-role")!;
  const emailField = $<HTMLInputElement>("#profile-email")!;
  const aboutField = $<HTMLTextAreaElement>("#profile-about")!;
  const meetingField = $<HTMLInputElement>("#profile-meetings-attended")!;

  if (document.activeElement !== nameField) nameField.value = activeProfile.name;
  if (document.activeElement !== roleField) roleField.value = activeProfile.role;
  if (document.activeElement !== emailField) emailField.value = activeProfile.email || "";
  if (document.activeElement !== aboutField) aboutField.value = activeProfile.about;
  if (document.activeElement !== meetingField) meetingField.value = activeProfile.meetingsAttended;

  const name = activeProfile.name.trim();
  $("#profile-display-name")!.textContent = name || "Your profile";
  $("#profile-role-summary")!.textContent = activeProfile.role.trim() || "Role not set";

  const avatar = $("#profile-avatar")!;
  if (name) {
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    avatar.replaceChildren(document.createTextNode(initials));
    avatar.classList.add("has-initials");
  } else {
    avatar.classList.remove("has-initials");
    if (!avatar.querySelector("svg")) {
      avatar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c.8-3.5 3.4-5.5 7.5-5.5s6.7 2 7.5 5.5"/></svg>';
    }
  }

  const scored = state.commitments.filter(c => c.status !== "rejected");
  const score = state.isAnalyzed && scored.length ? Math.round(scored.reduce((sum, c) => sum + calculateScore(c).score, 0) / scored.length) : null;
  $("#profile-vague-score")!.textContent = score === null ? "—" : String(score).padStart(2, "0");
  $("#profile-vague-score")!.style.color = score === null ? "var(--bronze)" : colourForScore(score);
  $("#profile-clarified-count")!.textContent = String(activeProfile.tasks.length);

  const activeTeams = activeProfile.teams.filter(team => team.status === "active");
  $("#profile-team-count")!.textContent = String(activeTeams.length);

  const history = $("#team-history")!;
  history.replaceChildren();
  if (!activeProfile.teams.length) {
    const empty = document.createElement("p");
    empty.className = "team-empty";
    empty.textContent = "No team history yet. Add a team you belong to, or use Join team to record one here.";
    history.append(empty);
  } else {
    for (const team of [...activeProfile.teams].reverse()) {
      const row = document.createElement("div");
      row.className = "team-row";
      const info = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = team.name;
      const small = document.createElement("small");
      small.textContent = team.status === "active" ? "Active team unit" : "Previous team / Completed";
      info.append(strong, small);
      const actions = document.createElement("div");
      const badge = document.createElement("span");
      badge.className = "team-state" + (team.status === "active" ? "" : " previous");
      badge.textContent = team.status === "active" ? "Active" : "Previous";
      actions.append(badge);
      if (team.status === "active") {
        const leave = document.createElement("button");
        leave.className = "text-button team-leave";
        leave.type = "button";
        leave.dataset.teamAction = "leave";
        leave.dataset.teamId = team.id;
        leave.textContent = "Leave team";
        actions.append(leave);
      }
      row.append(info, actions);
      history.append(row);
    }
  }

  renderSavedMeetings();
  renderTopbarProfile();
}

function selectPromise(c: Commitment) {
  const card = $<HTMLElement>('.promise-card[data-id="' + CSS.escape(c.id) + '"]', nodes.inspector);
  if (!card) return;
  $$('.promise-card', nodes.inspector).forEach(el => el.classList.toggle("is-selected", el === card));
  const mark = $<HTMLElement>('.promise-mark[data-id="' + CSS.escape(c.id) + '"]', nodes.transcriptScroll);
  if (mark) {
    mark.scrollIntoView({ behavior: motion.reduced() ? "auto" : "smooth", block: "center" });
    motion.pulse(mark);
  }
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function makeTaskCard(task: Task) {
  const card = document.createElement("article");
  card.className = "task-card";
  card.dataset.id = task.id;
  card.innerHTML =
    '<h3></h3><div class="task-detail"><span><b>OWNER</b><span data-task-owner></span></span><span><b>BY</b><span data-task-deadline></span></span></div><p class="task-quote"></p><div class="task-footer"><span class="task-state"></span><div style="display:flex;gap:6px;"><button class="text-button danger-link" type="button" data-delete-task title="Delete task" style="font-size:11px;">✕</button><button class="task-move text-button" type="button" data-move="next"></button></div></div>';
  $("h3", card)!.textContent = task.title;
  $("[data-task-owner]", card)!.textContent = task.owner || "Unassigned";
  $("[data-task-deadline]", card)!.textContent = task.deadline || "Not set";
  $(".task-quote", card)!.textContent = "“" + task.quote + "”";
  $(".task-state", card)!.textContent = task.status === "todo" ? "TO DO" : task.status === "doing" ? "DOING" : "DONE";
  const move = $(".task-move", card)!;
  move.textContent = task.status === "todo" ? "Move to Doing →" : task.status === "doing" ? "Move to Done →" : "Move to To Do ↺";
  return card;
}

function labelsForStatus(status: string) {
  return status === "todo" ? "To Do" : status === "doing" ? "Doing" : "Done";
}

function renderBoard() {
  for (const status of ["todo", "doing", "done"] as const) {
    const list = $('[data-task-list="' + status + '"]')!;
    list.replaceChildren();
    const tasks = activeProfile.tasks.filter(t => t.status === status);
    $('[data-column-count="' + status + '"]')!.textContent = String(tasks.length);
    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "column-empty";
      empty.textContent = status === "todo" ? "Nothing queued." : status === "doing" ? "Nothing in progress." : "Nothing completed yet.";
      list.append(empty);
    } else {
      tasks.forEach(task => list.append(makeTaskCard(task)));
    }
  }
  $("#board-caption")!.textContent = activeProfile.tasks.length
    ? activeProfile.tasks.length + " active task" + (activeProfile.tasks.length === 1 ? "" : "s") + " saved in " + activeProfile.name + " profile."
    : "No tasks yet. Confirm a promise in Review or use Add Task to start.";
  bindMotion($("#board-grid")!);
}

function colourForScore(score: number) {
  if (score <= 15) return getComputedStyle(document.documentElement).getPropertyValue("--clear").trim();
  if (score <= 45) return getComputedStyle(document.documentElement).getPropertyValue("--fuzzy").trim();
  return getComputedStyle(document.documentElement).getPropertyValue("--vague").trim();
}

function parseISODate(value: string | undefined): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null;
}

function calendarUrl(task: Task) {
  const date = parseISODate(task.deadline);
  if (!date) return "#";
  const next = new Date(date + "T00:00:00");
  next.setDate(next.getDate() + 1);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
  const title = encodeURIComponent(task.title);
  const details = encodeURIComponent("Owner: " + task.owner + "\nFrom Ergon Commitment Intelligence.");
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" +
    title +
    "&dates=" +
    ymd(new Date(date + "T00:00:00")) +
    "/" +
    ymd(next) +
    "&details=" +
    details
  );
}

function renderReminders() {
  const root = $("#reminder-list")!;
  root.replaceChildren();
  const dated = activeProfile.tasks.filter(t => parseISODate(t.deadline));
  if (!dated.length) {
    const p = document.createElement("p");
    p.className = "reminder-empty";
    p.textContent = activeProfile.tasks.length
      ? "Add a full date (YYYY-MM-DD) to a task to create a calendar reminder link."
      : "Approve a task with a due date to create a calendar reminder link.";
    root.append(p);
    return;
  }
  for (const task of dated) {
    const row = document.createElement("div");
    row.className = "reminder-item";
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = task.title;
    const small = document.createElement("small");
    small.textContent = task.owner + " · due " + task.deadline;
    info.append(strong, small);
    const links = document.createElement("div");
    links.className = "reminder-links";
    const url = calendarUrl(task);
    const add = document.createElement("a");
    add.className = "text-button";
    add.href = url;
    add.target = "_blank";
    add.rel = "noopener noreferrer";
    add.textContent = "Add to Google Calendar ↗";
    const copy = document.createElement("button");
    copy.className = "text-button";
    copy.type = "button";
    copy.textContent = "Copy reminder";
    copy.addEventListener("click", async () => {
      const text = "Reminder: " + task.title + " — owned by " + task.owner + ", due " + task.deadline + ".";
      try {
        await navigator.clipboard.writeText(text);
        toast("Reminder copied to clipboard.", "success");
      } catch {
        toast(text, "info");
      }
    });
    links.append(add, copy);
    row.append(info, links);
    root.append(row);
  }
  bindMotion(root);
}

function renderDashboard(options: { animateDebt?: boolean } = {}) {
  const current = state.isAnalyzed ? debtNow() : null;
  const before = state.debtBefore;
  const debtEl = $("#debt-now")!;
  const beforeEl = $("#debt-before")!;
  const bar = $("#debt-bar-fill")!;
  if (current === null) {
    debtEl.textContent = "—";
    beforeEl.textContent = "—";
    $("#debt-change")!.textContent = "No unconfirmed promises";
    bar.style.width = "0%";
  } else {
    beforeEl.textContent = String(before ?? current).padStart(2, "0");
    const from = state.lastDebt === null ? current : state.lastDebt;
    if (options.animateDebt && state.lastDebt !== null && from !== current) {
      motion.debt(debtEl, from, current);
    } else {
      debtEl.textContent = String(current).padStart(2, "0");
    }
    debtEl.style.color = colourForScore(current);
    bar.style.width = Math.max(2, current) + "%";
    bar.style.background = colourForScore(current);
    $("#debt-change")!.textContent =
      current < (before ?? current)
        ? "Down " + ((before ?? current) - current) + " points after clarification"
        : current > (before ?? current)
        ? "Up " + (current - (before ?? current)) + " points since analysis"
        : "Compared with the analysis-time baseline";
    state.lastDebt = current;
  }
  const live = state.commitments.filter(c => c.status !== "rejected");
  $("#promise-total")!.textContent = live.length + " PROMISE" + (live.length === 1 ? "" : "S");
  const clarity = { clear: 0, fuzzy: 0, vague: 0 };
  live.forEach(c => clarity[calculateScore(c).label]++);
  const mix = $("#mix-content")!;
  mix.replaceChildren();
  if (!state.isAnalyzed || !live.length) {
    const empty = document.createElement("div");
    empty.className = "mix-empty";
    empty.textContent = "Your clarity mix appears after transcript review.";
    mix.append(empty);
  } else {
    const pie = document.createElement("div");
    pie.className = "pie-chart";
    const total = live.length;
    const clearDeg = (clarity.clear / total) * 360;
    const fuzzyDeg = clearDeg + (clarity.fuzzy / total) * 360;
    pie.style.background =
      "conic-gradient(var(--clear) 0deg " +
      clearDeg +
      "deg,var(--fuzzy) " +
      clearDeg +
      "deg " +
      fuzzyDeg +
      "deg,var(--vague) " +
      fuzzyDeg +
      "deg 360deg)";
    pie.setAttribute("role", "img");
    pie.setAttribute("aria-label", "Pie chart: " + clarity.clear + " clear, " + clarity.fuzzy + " fuzzy, " + clarity.vague + " vague promises out of " + total + ".");
    const legend = document.createElement("div");
    legend.className = "mix-legend";
    for (const [key, label] of [["clear", "Clear"], ["fuzzy", "Fuzzy"], ["vague", "Vague"]] as const) {
      const row = document.createElement("div");
      row.className = "mix-row";
      const dot = document.createElement("i");
      dot.className = "legend-dot " + key + "-dot";
      const txt = document.createElement("span");
      txt.textContent = label;
      const num = document.createElement("b");
      num.textContent = String(clarity[key]);
      const share = document.createElement("span");
      share.className = "mix-share";
      share.textContent = Math.round((clarity[key] / total) * 100) + "%";
      row.append(dot, txt, num, share);
      legend.append(row);
    }
    mix.append(pie, legend);
  }
  const scoreChart = $("#score-bar-chart")!;
  scoreChart.replaceChildren();
  if (!state.isAnalyzed || !live.length) {
    const empty = document.createElement("p");
    empty.className = "mix-empty";
    empty.textContent = "The bar chart appears after transcript review.";
    scoreChart.append(empty);
  } else {
    const maxCount = Math.max(1, clarity.clear, clarity.fuzzy, clarity.vague);
    for (const [key, label] of [["clear", "Clear"], ["fuzzy", "Fuzzy"], ["vague", "Vague"]] as const) {
      const slot = document.createElement("div");
      slot.className = "score-bar-slot " + key;
      slot.setAttribute("aria-label", label + ": " + clarity[key] + " promises");
      const value = document.createElement("span");
      value.className = "score-bar-value";
      value.textContent = String(clarity[key]);
      const track = document.createElement("span");
      track.className = "score-bar-track";
      const fill = document.createElement("span");
      fill.className = "score-bar-fill";
      fill.style.height = (clarity[key] ? Math.max(4, (clarity[key] / maxCount) * 100) : 0) + "%";
      track.append(fill);
      const category = document.createElement("span");
      category.className = "score-bar-label";
      category.textContent = label;
      slot.append(value, track, category);
      scoreChart.append(slot);
    }
  }
  const owners: Record<string, number> = {};
  for (const task of activeProfile.tasks) {
    const name = task.owner || "Unassigned";
    owners[name] = (owners[name] || 0) + 1;
  }
  const load = $("#load-content")!;
  load.replaceChildren();
  const ownerRows = Object.entries(owners).sort((a, b) => b[1] - a[1]);
  if (!ownerRows.length) {
    const empty = document.createElement("div");
    empty.className = "mix-empty";
    empty.textContent = "Owner workload is empty until tasks are active.";
    load.append(empty);
  } else {
    const maxLoad = Math.max(...ownerRows.map(x => x[1]));
    for (const [name, count] of ownerRows) {
      const row = document.createElement("div");
      row.className = "load-row";
      const who = document.createElement("span");
      who.textContent = name;
      const track = document.createElement("span");
      track.className = "load-track";
      const fill = document.createElement("span");
      fill.style.width = (count / maxLoad) * 100 + "%";
      track.append(fill);
      const value = document.createElement("b");
      value.textContent = String(count).padStart(2, "0");
      row.append(who, track, value);
      load.append(row);
    }
  }
  const orphans = live.filter(c => genericOwner(c.owner || ""));
  $("#orphan-copy")!.textContent = state.isAnalyzed
    ? orphans.length
      ? orphans.length + " promise" + (orphans.length === 1 ? " has" : "s have") + " no confirmed owner. Clarify in Review before approval."
      : "Every remaining promise has a named owner."
    : "No unconfirmed promises awaiting owner assignment.";
  renderReminders();
  renderProfile();
}

function downloadTasksCSV() {
  if (!activeProfile.tasks.length) {
    toast("No tasks in this profile to export yet.", "error");
    return;
  }
  const rows = [
    ["Summary", "Owner", "Deadline", "Status", "Evidence"],
    ...activeProfile.tasks.map(t => [t.title, t.owner, t.deadline, labelsForStatus(t.status), t.quote])
  ];
  const csv = rows.map(row => row.map(v => '"' + String(v ?? "").replaceAll('"', '""') + '"').join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ergon-" + activeProfile.name.toLowerCase().replace(/\s+/g, "-") + "-tasks.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("Task board CSV downloaded.", "success");
}

function exportWorkspaceJSON() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    profiles
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ergon-workspace-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Workspace backup JSON downloaded.", "success");
}

let viewSequence = 0;
async function switchView(name: string) {
  if (!["profile", "review", "board", "dashboard", "settings", "help"].includes(name) || name === state.view) return;
  const current = $<HTMLElement>('[data-view-panel="' + state.view + '"]');
  const next = $<HTMLElement>('[data-view-panel="' + name + '"]');
  const seq = ++viewSequence;
  await motion.changeView(current, next);
  if (seq !== viewSequence) return;
  state.view = name;
  $$('.nav-link').forEach(button => {
    const active = button.dataset.view === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#current-section")!.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  if (next) {
    motion.reveal($$("[data-enter]", next));
  }
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "paper";
  const label = dark ? "Switch to Paper theme" : "Switch to Night theme";
  $("#theme-toggle")!.setAttribute("aria-pressed", String(dark));
  $("#theme-toggle")!.setAttribute("aria-label", label);
  $("#theme-toggle")!.setAttribute("title", label);
  $("#theme-toggle-label")!.textContent = label;
  renderDashboard();
}

function renderAll(options: { animateDebt?: boolean } = {}) {
  renderTranscriptArea();
  renderInspector();
  renderBoard();
  renderDashboard(options);
  renderProfile();
  updateCounters();
}

// Event Listeners Initialization
function initApp() {
  initProfilesStore();

  nodes.transcriptInput.addEventListener("input", () => {
    state.sample = false;
    syncInput();
  });

  $("#load-example")!.addEventListener("click", () => {
    nodes.transcriptInput.value = sampleTranscript;
    state.sample = true;
    nodes.title.value = "Avartan Planning Sync — Example";
    syncInput();
    setSourceLabel("Example Transcript");
    toast("Example transcript loaded for review.", "success");
  });

  nodes.file.addEventListener("change", async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "vtt", "srt"].includes(ext || "")) {
      toast("Choose a .txt, .vtt, or .srt transcript.", "error");
      nodes.file.value = "";
      return;
    }
    try {
      nodes.transcriptInput.value = await file.text();
      state.sample = false;
      syncInput();
      setSourceLabel("Loaded file · " + file.name);
      toast("Transcript loaded successfully.", "success");
    } catch {
      toast("This transcript could not be opened. Try pasting its text instead.", "error");
    }
    nodes.file.value = "";
  });

  const inputWrap = $("#input-wrap")!;
  inputWrap.addEventListener("dragover", event => {
    event.preventDefault();
    inputWrap.classList.add("is-dragover");
  });
  inputWrap.addEventListener("dragleave", () => inputWrap.classList.remove("is-dragover"));
  inputWrap.addEventListener("drop", async (event: DragEvent) => {
    event.preventDefault();
    inputWrap.classList.remove("is-dragover");
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.(txt|vtt|srt)$/i.test(file.name)) {
      toast("Choose a .txt, .vtt, or .srt transcript.", "error");
      return;
    }
    try {
      nodes.transcriptInput.value = await file.text();
      state.sample = false;
      syncInput();
      setSourceLabel("Loaded file · " + file.name);
      toast("Transcript loaded successfully.", "success");
    } catch {
      toast("This transcript could not be opened.", "error");
    }
  });

  nodes.analyze.addEventListener("click", analyzeTranscript);

  // Save current meeting to profile archive
  $("#save-meeting-btn")?.addEventListener("click", saveCurrentMeetingToProfile);

  // Start fresh meeting review
  $("#new-meeting-btn")?.addEventListener("click", () => {
    state.transcript = "";
    state.sample = false;
    state.commitments = [];
    state.debtBefore = null;
    state.lastDebt = null;
    state.isAnalyzed = false;
    nodes.transcriptInput.value = "";
    nodes.title.value = "";
    nodes.date.value = "";
    nodes.charCount.textContent = "0 characters";
    setSourceLabel("Awaiting transcript");
    renderAll();
    toast("Started new meeting review session.", "info");
  });

  nodes.inspector.addEventListener("input", (event: Event) => {
    const target = event.target as HTMLElement;
    const input = target.closest<HTMLInputElement>("[data-field]");
    if (!input) return;
    const card = input.closest<HTMLElement>(".promise-card");
    if (!card) return;
    const c = state.commitments.find(x => x.id === card.dataset.id);
    if (!c || c.status !== "pending") return;
    const field = input.dataset.field as "owner" | "deadline" | "deliverable";
    c[field] = input.value;
    updateCardVisual(c, card);
    renderDashboard({ animateDebt: true });
  });

  nodes.inspector.addEventListener("click", async (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const clickedCard = target.closest<HTMLElement>(".promise-card");
    if (clickedCard && !target.closest("button,input")) {
      const selected = state.commitments.find(x => x.id === clickedCard.dataset.id);
      if (selected) selectPromise(selected);
      return;
    }
    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;
    const card = button.closest<HTMLElement>(".promise-card");
    if (!card) return;
    const c = state.commitments.find(x => x.id === card.dataset.id);
    if (!c) return;
    if (button.dataset.action === "reject") {
      c.status = "rejected";
      renderAll({ animateDebt: true });
      toast("Promise rejected and removed from Meeting Debt.", "info");
      return;
    }
    if (button.dataset.action === "accept") {
      for (const input of $$<HTMLInputElement>("[data-field]", card)) {
        const field = input.dataset.field as "owner" | "deadline" | "deliverable";
        c[field] = input.value;
      }
      refreshScore(c);
      if (genericOwner(c.owner || "") || !String(c.deadline || "").trim() || !String(c.deliverable || "").trim()) {
        const missing = calculateScore(c).missing.join(", ");
        toast("Clarify " + (missing || "the task details") + " before approving.", "error");
        card.classList.add("needs-clarity");
        setTimeout(() => card.classList.remove("needs-clarity"), 500);
        return;
      }
      await motion.flight(card, $('[data-view="board"]')!);
      c.status = "accepted";
      const task: Task = {
        id: "task-" + c.id + "-" + Date.now(),
        commitmentId: c.id,
        title: c.deliverable.trim(),
        owner: c.owner.trim(),
        deadline: c.deadline.trim(),
        status: "todo",
        quote: c.quote,
        speaker: c.speaker
      };
      activeProfile.tasks.push(task);
      saveProfilesToStorage();
      renderAll({ animateDebt: true });
      toast("Approved task saved to " + activeProfile.name + " board.", "success");
    }
  });

  nodes.transcriptScroll.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const mark = target.closest<HTMLElement>(".promise-mark");
    if (mark) {
      const c = state.commitments.find(x => x.id === mark.dataset.id);
      if (c) selectPromise(c);
    }
  });

  nodes.transcriptScroll.addEventListener("keydown", (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if ((event.key === "Enter" || event.key === " ") && target.matches(".promise-mark")) {
      event.preventDefault();
      const c = state.commitments.find(x => x.id === target.dataset.id);
      if (c) selectPromise(c);
    }
  });

  // Profile Form Real-time Auto-saving
  $("#profile-form")!.addEventListener("submit", event => event.preventDefault());
  $("#profile-form")!.addEventListener("input", (event: Event) => {
    const target = event.target as HTMLInputElement;
    if (target.id === "profile-name") activeProfile.name = target.value;
    else if (target.id === "profile-role") activeProfile.role = target.value;
    else if (target.id === "profile-email") activeProfile.email = target.value;
    else if (target.id === "profile-about") activeProfile.about = target.value;
    saveProfilesToStorage();
    renderProfile();
  });

  $("#profile-meetings-attended")!.addEventListener("input", (event: Event) => {
    activeProfile.meetingsAttended = (event.target as HTMLInputElement).value;
    saveProfilesToStorage();
  });

  // Team Form
  $("#open-team-form")!.addEventListener("click", () => {
    const form = $("#join-team-form")!;
    form.hidden = false;
    $("#open-team-form")!.hidden = true;
    $<HTMLInputElement>("#team-name-input")!.focus();
  });

  $("#join-team-form")!.addEventListener("submit", event => {
    event.preventDefault();
    const input = $<HTMLInputElement>("#team-name-input")!;
    const name = input.value.trim();
    if (!name) return;
    if (activeProfile.teams.some(team => team.status === "active" && team.name.toLowerCase() === name.toLowerCase())) {
      toast("That team is already listed as active.", "error");
      return;
    }
    activeProfile.teams.push({
      id: "team-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      name,
      status: "active"
    });
    input.value = "";
    $("#join-team-form")!.hidden = true;
    $("#open-team-form")!.hidden = false;
    saveProfilesToStorage();
    renderProfile();
    toast("Team added to " + activeProfile.name + " profile.", "success");
  });

  $("#team-history")!.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLElement>("[data-team-action=leave]");
    if (!button) return;
    const team = activeProfile.teams.find(item => item.id === button.dataset.teamId);
    if (!team) return;
    team.status = "previous";
    saveProfilesToStorage();
    renderProfile();
    toast("Marked team as completed/previous in this profile.", "info");
  });

  // Board Task Interactions
  $("#board-grid")!.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    // Delete task button
    const delBtn = target.closest<HTMLElement>("[data-delete-task]");
    if (delBtn) {
      const card = delBtn.closest<HTMLElement>(".task-card");
      if (!card) return;
      activeProfile.tasks = activeProfile.tasks.filter(t => t.id !== card.dataset.id);
      saveProfilesToStorage();
      renderBoard();
      renderDashboard({ animateDebt: false });
      updateCounters();
      toast("Task removed from board.", "info");
      return;
    }

    // Move task button
    const button = target.closest<HTMLElement>("[data-move]");
    if (!button) return;
    const card = button.closest<HTMLElement>(".task-card");
    if (!card) return;
    const task = activeProfile.tasks.find(t => t.id === card.dataset.id);
    if (!task) return;
    const to = task.status === "todo" ? "doing" : task.status === "doing" ? "done" : "todo";
    const mutate = () => {
      task.status = to;
      saveProfilesToStorage();
      renderBoard();
      renderDashboard({ animateDebt: false });
      updateCounters();
    };
    motion.flip($("#board-grid"), mutate);
    toast("Task moved to " + labelsForStatus(to) + ".", "success");
  });

  // Add Task Modal
  $("#open-new-task-btn")?.addEventListener("click", () => {
    $<HTMLInputElement>("#modal-task-title")!.value = "";
    $<HTMLInputElement>("#modal-task-owner")!.value = activeProfile.name || "";
    $<HTMLInputElement>("#modal-task-deadline")!.value = "";
    $<HTMLSelectElement>("#modal-task-status")!.value = "todo";
    $("#new-task-modal")!.hidden = false;
  });

  $("#close-task-modal-btn")?.addEventListener("click", () => {
    $("#new-task-modal")!.hidden = true;
  });
  $("#cancel-task-modal-btn")?.addEventListener("click", () => {
    $("#new-task-modal")!.hidden = true;
  });

  $("#new-task-form")?.addEventListener("submit", (e: Event) => {
    e.preventDefault();
    const title = $<HTMLInputElement>("#modal-task-title")!.value.trim();
    const owner = $<HTMLInputElement>("#modal-task-owner")!.value.trim();
    const deadline = $<HTMLInputElement>("#modal-task-deadline")!.value.trim();
    const status = ($<HTMLSelectElement>("#modal-task-status")!.value as "todo" | "doing" | "done") || "todo";
    if (!title) return;

    const newTask: Task = {
      id: "task-manual-" + Date.now(),
      commitmentId: "custom-" + Date.now(),
      title,
      owner: owner || "Unassigned",
      deadline: deadline || "Not set",
      status,
      quote: "Directly created in " + activeProfile.name + " board",
      speaker: activeProfile.name || "User"
    };

    activeProfile.tasks.push(newTask);
    saveProfilesToStorage();
    renderBoard();
    renderDashboard({ animateDebt: false });
    updateCounters();
    $("#new-task-modal")!.hidden = true;
    toast("Task created and saved to profile board.", "success");
  });

  // Profile Switcher Dropdown
  const profileSwitchBtn = $("#profile-switch-btn");
  const profileDropdown = $("#profile-dropdown-menu");
  if (profileSwitchBtn && profileDropdown) {
    profileSwitchBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      const open = !profileDropdown.hidden;
      profileDropdown.hidden = open;
      profileSwitchBtn.setAttribute("aria-expanded", String(!open));
    });

    document.addEventListener("click", (e: MouseEvent) => {
      if (!profileDropdown.hidden && !profileDropdown.contains(e.target as Node) && e.target !== profileSwitchBtn) {
        profileDropdown.hidden = true;
        profileSwitchBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Create New Profile Modal
  const openNewProfileBtn = $("#topbar-new-profile-btn");
  const profileModal = $("#new-profile-modal");
  if (openNewProfileBtn && profileModal) {
    openNewProfileBtn.addEventListener("click", (e: MouseEvent) => {
      e.stopPropagation();
      profileDropdown!.hidden = true;
      $<HTMLInputElement>("#modal-profile-name")!.value = "";
      $<HTMLInputElement>("#modal-profile-role")!.value = "";
      $<HTMLInputElement>("#modal-profile-email")!.value = "";
      profileModal.hidden = false;
    });

    $("#close-profile-modal-btn")?.addEventListener("click", () => {
      profileModal.hidden = true;
    });
    $("#cancel-profile-modal-btn")?.addEventListener("click", () => {
      profileModal.hidden = true;
    });

    $("#new-profile-form")?.addEventListener("submit", (e: Event) => {
      e.preventDefault();
      const name = $<HTMLInputElement>("#modal-profile-name")!.value.trim();
      const role = $<HTMLInputElement>("#modal-profile-role")!.value.trim();
      const email = $<HTMLInputElement>("#modal-profile-email")!.value.trim();
      if (!name) return;
      createNewProfile(name, role, email);
      profileModal.hidden = true;
    });
  }

  // Backup and Export buttons
  $("#board-export")!.addEventListener("click", downloadTasksCSV);
  $("#dashboard-export")!.addEventListener("click", downloadTasksCSV);
  $("#export-json-btn")?.addEventListener("click", exportWorkspaceJSON);

  // Import Backup
  $("#import-json-file")?.addEventListener("change", async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (Array.isArray(data.profiles) && data.profiles.length) {
        profiles = data.profiles;
        activeProfile = profiles[0];
        saveProfilesToStorage();
        renderTopbarProfile();
        renderAll();
        toast("Workspace profiles successfully restored from backup!", "success");
      } else {
        toast("Invalid workspace backup file format.", "error");
      }
    } catch {
      toast("Could not parse JSON backup file.", "error");
    }
    input.value = "";
  });

  // Reset Session
  $("#reset-session")!.addEventListener("click", () => {
    state.transcript = "";
    state.sample = false;
    state.commitments = [];
    state.debtBefore = null;
    state.lastDebt = null;
    state.isAnalyzed = false;
    nodes.transcriptInput.value = "";
    nodes.title.value = "";
    nodes.date.value = "";
    nodes.message.textContent = "Add a transcript to begin. Speaker names help anchor each promise.";
    nodes.analyze.disabled = false;
    nodes.analyze.querySelector("span")!.textContent = "Review commitments";
    nodes.progress.hidden = true;
    nodes.progressFill.style.transform = "scaleX(0)";
    nodes.charCount.textContent = "0 characters";
    setSourceLabel("Awaiting transcript");
    renderAll();
    toast("Active meeting review reset.", "success");
    switchView("review");
  });

  $$('.nav-link').forEach(button => button.addEventListener("click", () => switchView(button.dataset.view!)));
  $$('[data-go-view]').forEach(button => button.addEventListener("click", () => switchView(button.dataset.goView!)));

  $("#theme-toggle")!.addEventListener("click", toggleTheme);
  $("#settings-theme-toggle")!.addEventListener("click", toggleTheme);

  // Initialize Motion and Initial Render
  motion.ready().then(() => {
    motion.startDrift($$(".wash"));
    bindMotion(document);
    const profilePanel = $('[data-view-panel="profile"]');
    if (profilePanel) {
      motion.reveal($$("[data-enter]", profilePanel));
    }
  });

  // Landing Page vs Workspace View Navigation
  function showWorkspace(viewName = "profile") {
    const landing = $("#landing-view");
    const app = $("#app-workspace-view");
    if (landing) landing.hidden = true;
    if (app) app.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
    switchView(viewName);
    history.pushState(null, "", "#" + viewName);
  }

  function showLanding(hash = "#top") {
    const landing = $("#landing-view");
    const app = $("#app-workspace-view");
    if (app) app.hidden = true;
    if (landing) landing.hidden = false;
    history.pushState(null, "", hash);
    if (hash && hash !== "#top") {
      const target = $(hash);
      if (target) target.scrollIntoView({ behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Hook all "Open Ergon" CTAs
  $$('a[href="/app"], a[href="#app"], .landing-button-primary').forEach(link => {
    link.addEventListener("click", (e: Event) => {
      e.preventDefault();
      showWorkspace("profile");
    });
  });

  // Mobile menu toggle in landing header
  const menuToggle = $(".menu-toggle");
  const landingNav = $("#landing-nav");
  if (menuToggle && landingNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = landingNav.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Smooth scroll links inside landing page
  $$<HTMLAnchorElement>('.landing-nav a, .hero-actions a[href^="#"], .footer-links a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", (e: Event) => {
      const href = anchor.getAttribute("href");
      if (href && href.startsWith("#") && href !== "#app") {
        e.preventDefault();
        const app = $("#app-workspace-view");
        if (app && !app.hidden) {
          showLanding(href);
        } else {
          const target = $(href);
          if (target) {
            target.scrollIntoView({ behavior: "smooth" });
            history.pushState(null, "", href);
          }
          if (landingNav?.classList.contains("is-open")) {
            landingNav.classList.remove("is-open");
            menuToggle?.setAttribute("aria-expanded", "false");
          }
        }
      }
    });
  });

  // Return to landing page from workspace
  $("#rail-landing-btn")?.addEventListener("click", () => showLanding("#top"));
  $("#topbar-home-link")?.addEventListener("click", (e: Event) => {
    e.preventDefault();
    showLanding("#top");
  });
  $(".wordmark")?.addEventListener("click", (e: Event) => {
    e.preventDefault();
    showLanding("#top");
  });

  // Check initial hash to decide whether to show workspace or landing
  const initialHash = window.location.hash.toLowerCase();
  const workspaceHashes = ["#app", "#profile", "#review", "#board", "#dashboard", "#settings", "#help"];
  if (workspaceHashes.some(h => initialHash.startsWith(h))) {
    const targetView = initialHash.replace("#", "") || "profile";
    showWorkspace(targetView === "app" ? "profile" : targetView);
  } else {
    showLanding(initialHash || "#top");
  }

  // Simple scroll reveal observer for landing page
  if (typeof window !== "undefined" && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).style.opacity = "1";
          (entry.target as HTMLElement).style.transform = "none";
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    $$("[data-reveal]").forEach(el => {
      (el as HTMLElement).style.transition = "opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1), transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)";
      revealObserver.observe(el);
    });
  }

  renderTopbarProfile();
  renderAll();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
