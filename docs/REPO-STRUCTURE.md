# Suggested Public Repository Structure

```text
community-carpool/
├── .env.example
├── .github/
│   └── workflows/
├── demo/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── Dockerfile
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONFIGURATION.md
│   ├── COOLIFY.md
│   ├── PRIVACY.md
│   ├── TRUST-CENTER.md
│   └── SECURITY-DEPLOYMENT.md
├── src/
│   ├── config/
│   ├── auth/
│   ├── organizations/
│   ├── households/
│   ├── calendars/
│   ├── rides/
│   ├── matching/
│   ├── messaging/
│   ├── privacy/
│   └── admin/
├── migrations/
├── tests/
├── Dockerfile
├── docker-compose.coolify.example.yml
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── LICENSE
└── package.json
```

The `demo/` site intentionally contains no production APIs, credentials, or real data and can be deployed independently for evaluation.
