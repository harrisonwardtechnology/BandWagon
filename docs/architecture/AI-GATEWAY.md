# BandWagon AI Gateway

BandWagon uses a self-hosted LiteLLM Proxy in Coolify as the single gateway for normal LLM workloads.

## Architecture

```text
BandWagon Web
   |
   +--> LiteLLM (private Coolify service)
   |      +--> bandwagon-fast     -> OpenAI GPT-5.6 Luna
   |      +--> bandwagon-balanced -> OpenAI GPT-5.6 Terra
   |      +--> bandwagon-deep     -> OpenAI GPT-5.6 Sol
   |
   +--> Google Document AI
   |      +--> specialized identity/document processing
   |
   +--> IONOS S3-compatible Object Storage
          +--> public assets bucket
          +--> private documents bucket
```

Google Document AI is intentionally outside LiteLLM because it is a specialized document-processing service rather than a normal LLM inference endpoint. BandWagon's internal AI service remains the common application abstraction for both paths.

## Coolify deployment

Deploy LiteLLM as a separate private service in the same Coolify environment as BandWagon. BandWagon should reach it over the internal service network rather than a public Internet hostname whenever possible.

Recommended LiteLLM environment variables:

```text
LITELLM_MASTER_KEY=<random long secret>
LITELLM_DATABASE_URL=postgresql://<dedicated-user>:<password>@<postgres-host>/<dedicated-db>
OPENAI_API_KEY=<provider key>
```

BandWagon environment variables:

```text
LITELLM_BASE_URL=http://<internal-litellm-service>:4000
LITELLM_API_KEY=<BandWagon virtual key or master key during bootstrap>
AI_FAST_MODEL=bandwagon-fast
AI_BALANCED_MODEL=bandwagon-balanced
AI_DEEP_MODEL=bandwagon-deep
```

Do not place provider API keys in the BandWagon application once LiteLLM is operational.

## Security defaults

- LiteLLM is an internal gateway, not a public user endpoint.
- Use a dedicated PostgreSQL database/user for LiteLLM metadata.
- Do not configure prompt/response callbacks that send sensitive content to third-party observability systems.
- Do not retain raw driver-license, insurance, student, address, or safety-alert prompts in application logs.
- BandWagon stores purpose, model, token/cost metadata, confidence and structured results in `ai_jobs`; it does not need raw prompt history.
- Use separate virtual keys for production, development and administrative testing.
- Apply budgets/rate limits per virtual key and/or application purpose.
- Rotate provider and LiteLLM keys without changing BandWagon business logic.

## Routing policy

### bandwagon-fast
Default for high-volume structured work:

- insurance field extraction
- event parsing
- classification
- short match explanations
- routine admin assistant requests

### bandwagon-balanced
Escalation for ambiguous documents or reasoning-heavy admin questions.

### bandwagon-deep
Rare escalation only. Intended for difficult analysis where the lower-cost routes cannot produce a sufficiently reliable structured result.

Safety, eligibility, COPPA/age restrictions, emergency actions, organization approvals and credential expiration remain deterministic BandWagon rules. AI may extract or explain; it does not make those decisions.

## Sensitive document workflow

```text
Private IONOS S3 object
       |
       +--> specialized driver-license path -> Google Document AI
       |
       +--> insurance / flexible document path -> LiteLLM
                                                    |
                                                    +--> structured extraction only
       |
       +--> BandWagon validation rules
       |
       +--> organization human approval
```

AI output is always treated as untrusted structured input. Required fields are schema-validated before being written to credential metadata.

## Cost accounting

LiteLLM provides gateway-level usage/spend tracking. BandWagon additionally records cost by business purpose so the support dashboard can report categories such as:

```text
Driver validation
Insurance extraction
Event parsing
Match explanations
Admin assistant
Safety summaries
```

The BandWagon record is the business/accounting source of truth; LiteLLM is the operational inference gateway.
