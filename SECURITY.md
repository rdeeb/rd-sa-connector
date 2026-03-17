# Security Policy

## Supported Versions

Only the latest released major version is supported with security updates.

## Reporting a Vulnerability

Please report vulnerabilities privately by opening a GitHub Security Advisory:

- https://github.com/rdeeb/rd-sa-connector/security/advisories/new

Do not open public issues for security reports.

## Security Baseline

- Node.js 18+ required.
- Strict runtime validation with Zod.
- HTTPS enforced by default.
- CI includes dependency audit checks.
- npm publish runs with provenance in GitHub Actions.