# Governance implementation plan

Baseline: main d8e0a729d5cdb3dd24218b782ce874e2bf655814; clean on 2026-10-07.
All ten requested items remain in scope. Work stays in the canonical checkout.

1. Reproduce stored changedPaths omitted on completion and takeover baseline gaps.
2. Make attempt audit observations explicit and durable under a separately versioned contract; fail closed for missing/failed Git evidence, preserve non-Git applicability.
3. Attribute concurrent changes by observed attempt evidence, never pending scopes; protect exclusions and reject ambiguous overlap.
4. Require target/version-bound passing reviews at integration start and completion; cancellation needs valid replacement and downstream reviews must not deadlock.
5. Distinguish self-reports, executor observations and independent review; bind trusted observations to attempt, contract and code revision.
6. Verify existing settings/layouts and routing end to end, including slow response generation, cancellation, CAS, frozen profiles and independent Native settings.
7. Keep one state owner and locks; atomic temp/rename must preserve prior committed data on failure and tolerate Windows occupancy.
8. Verify provider-neutral output budget finish classification and attempt/turn-bound truncation notices across restart.
9. Register every remaining loader anchor with fixed owner revision, match contract, drift failure and regression; migrate only proven public API equivalents and retain necessary Models seam.
10. Synchronize owner versions, lock metadata, integration assertions, README and provenance after source/regression evidence; correct historical worktree guidance.

Dependencies: 7 -> 1/2 -> 3 -> 4/5; 6 and 8 then 9; 10 and final acceptance follow all source changes.
Each slice gets a failing regression first, then focused validation. Keep all previous regressions.
Final acceptance: offline install-free win-desktop/npm run verify:upstream, runtime closure and necessary isolated Windows startup checks. Packaging follows only passing source gates, no publish/install/network/credentials/live paid requests.
No pushes, tags, releases, deployments or user-data migration are authorized.
