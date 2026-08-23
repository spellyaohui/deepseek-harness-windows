# Security policy

This is a public repository. Do not attach or commit real API keys, provider
credentials, session logs, exported conversations, local settings, crash dumps,
or screenshots containing private project or patient information.

## Reporting a vulnerability

Please use GitHub's private security-advisory feature for vulnerabilities. Do
not open a public issue containing an exploit, credential, private session
export, or sensitive local path.

## Repository hygiene

- Keep credentials in environment variables or Harness-managed local settings.
- Commit `.env.example` files only with placeholder values.
- Review staged changes for secrets before every push.
- Treat model output, exported Markdown, filenames, and HTTP parameters as
  untrusted input.
- Do not publish generated installers, runtime state, `node_modules`, or local
  upstream/reference checkouts in Git history.
- If a credential is committed, revoke it immediately before removing it from
  history.
