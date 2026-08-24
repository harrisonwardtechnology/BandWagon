# AI Production Governance

AI is not required for v1. `AI_RUNTIME_ENABLED` defaults off, and all deterministic ride, safety, calendar, credential review, and manual event workflows continue without providers.

## Enablement Gate

Enable production AI only after all items are complete:

1. Create a production-only LiteLLM virtual key, not a master key.
2. Configure LiteLLM budget and rate limits equal to or stricter than BandWagon policy.
3. Verify provider retention, training, region, and access-control settings and retain private evidence.
4. Disable prompt/response callbacks, request-body logging, and session replay.
5. Set approved fast, balanced, and deep aliases; BandWagon rejects other model names.
6. Set `AI_REQUEST_TIMEOUT_MS` between 1,000 and 120,000 ms and a conservative `AI_MAX_JOB_COST_MICROUSD` reservation.
7. Set a positive monthly hard cap for each organization and explicitly enable only its approved features.
8. Set `AI_RUNTIME_ENABLED=true`, redeploy, and verify Platform Health.

## Runtime Behavior

- Current consent version, organization master opt-in, feature opt-in, and positive hard cap are required.
- A row lock serializes the budget check. Completed costs and processing reservations count toward the cap.
- Inputs are bounded to 20,000 text characters and 10 MiB images.
- Calls time out and are not automatically retried.
- Provider error bodies are not returned to users or stored as job errors.
- Policy allows, denials, and manual fallbacks are recorded without raw prompts.
- AI outputs remain untrusted and require human review for credentials and event publication.

## Kill Switch and Fallback

Set `AI_RUNTIME_ENABLED=false` and redeploy to stop new provider calls while retaining organization choices and history. Failed or denied credential automation returns the document to manual review. Failed event intake leaves the organizer able to use the manual event publisher. Matching, safety, eligibility, and emergency decisions never depend on AI.
