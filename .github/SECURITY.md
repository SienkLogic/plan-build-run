# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Plan-Build-Run, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please use one of these methods:

1. **GitHub Security Advisories** (preferred): Use the [Report a vulnerability](https://github.com/SienkLogic/plan-build-run/security/advisories/new) feature on GitHub
2. **Email**: Contact the maintainers directly (see GitHub profile for contact info)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Fix or mitigation**: Depends on severity, but we aim for prompt resolution

## Scope

This policy covers the Plan-Build-Run plugin codebase, including:

- Hook scripts (`plugins/pbr/scripts/`)
- CLI tools (`pbr-tools.js`)
- Dashboard server (`dashboard/`)
- Plugin configuration and lifecycle management

## Security Considerations

Plan-Build-Run is a Claude Code plugin that runs locally on your machine. Key security aspects:

- **Hook scripts** execute as Node.js processes with the same permissions as your user account
- **No network calls** are made by the core plugin (the dashboard binds to `127.0.0.1` only)
- **File operations** are scoped to the project's `.planning/` directory
- **Commit validation** hooks inspect but do not modify git operations
- **No credentials or secrets** are stored by Plan-Build-Run

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No        |
