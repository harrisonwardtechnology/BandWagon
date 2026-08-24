export type CalendarConflictType = "exact_duplicate"|"potential_overlap"|null;

export function normalizedCalendarTitle(value: unknown) {
  return String(value||"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function milliseconds(value: unknown) {
  if (!value) return null;
  const parsed=new Date(String(value)).getTime();
  return Number.isFinite(parsed)?parsed:null;
}

export function classifyCalendarConflict(candidate:{title?:unknown;startsAt?:unknown;endsAt?:unknown},existing:{title?:unknown;startsAt?:unknown;endsAt?:unknown}):CalendarConflictType {
  const candidateStart=milliseconds(candidate.startsAt),existingStart=milliseconds(existing.startsAt);
  if(candidateStart==null||existingStart==null)return null;
  const sameTitle=normalizedCalendarTitle(candidate.title)!==""&&normalizedCalendarTitle(candidate.title)===normalizedCalendarTitle(existing.title);
  if(sameTitle&&Math.abs(candidateStart-existingStart)<=60_000)return "exact_duplicate";
  const candidateEnd=milliseconds(candidate.endsAt)??candidateStart,existingEnd=milliseconds(existing.endsAt)??existingStart;
  if(sameTitle&&candidateStart<=existingEnd&&existingStart<=candidateEnd)return "potential_overlap";
  return null;
}

export function calendarConflictMode(value: unknown):"merge_exact"|"keep_separate" {
  return value==="keep_separate"?"keep_separate":"merge_exact";
}
