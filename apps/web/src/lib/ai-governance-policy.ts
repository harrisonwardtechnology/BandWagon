export function aiRuntimeEnabled(value:unknown){return String(value||"").trim().toLowerCase()==="true";}
export function centsToMicrousd(cents:unknown){const value=Number(cents);return Number.isFinite(value)&&value>0?Math.round(value)*10_000:0;}
export function aiRequestTimeoutMs(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(1_000,Math.min(120_000,Math.round(parsed))):30_000;}
export function aiReservationMicrousd(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?Math.max(10_000,Math.min(10_000_000,Math.round(parsed))):250_000;}
export function budgetAllows(input:{budgetMicrousd:number;committedAndReservedMicrousd:number;requestedReservationMicrousd:number}){return input.budgetMicrousd>0&&input.committedAndReservedMicrousd+input.requestedReservationMicrousd<=input.budgetMicrousd;}
export function allowedAiModels(env:NodeJS.ProcessEnv){return new Set([env.AI_FAST_MODEL||"bandwagon-fast",env.AI_BALANCED_MODEL||"bandwagon-balanced",env.AI_DEEP_MODEL||"bandwagon-deep"]);}
