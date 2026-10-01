# Same-commit source archive rebuild — 2026-09-30

The desktop repair stays on official Harness `0.2.0-rc.2` at
`639ed015397290b3745d163aafe02ffee4aa3f84`. AgentTeams stays at
`0.1.22-desktop.1`. The rebuilt archives restore local build inputs; this is
not an upstream capability migration or a change to either runtime version.

The original archive files were absent from the supplied local workspace and
the published Windows ZIP. Both fixed official source checkouts were restored,
installed with frozen dependencies, built with the official `build:official`
profile, and packed with Node `26.7.0` and pnpm `11.7.0`. Each checkout's Git
status was clean. Preparation, downloads, installation, and upstream packing
took place outside the offline wrapper regression gate.

| Fixed source | Commit | Archives | Original SHA-256 retained | New SHA-256 |
| --- | --- | ---: | ---: | ---: |
| 0.1.7-rc.2 | 477b4f420553e8a52c2fbccc464d7561b239c443 | 323 | 52 | 271 |
| 0.2.0-rc.2 | 639ed015397290b3745d163aafe02ffee4aa3f84 | 327 | 54 | 273 |

The original release ZIP was verified against its published SHA-256,
`A3FCA0719E192361656F28EFED7C2C07C02C18BE4C361F831307B63BC76C9543`.
At the original absolute source path, all 2,172 shared non-manifest runtime
files from the rebuilt 0.2.0 archives match that ZIP byte for byte. This excludes
the independently maintained Models fork and does not establish original
identity for declarations or other files omitted by the installer.

Repeated `pnpm pack` calls showed different ordering of rewritten workspace
dependencies in package manifests. That observation is not a claim that every
archive difference has only that cause. The rebuild has its own byte identities.

After the archive discrepancy, candidate hashes, and required acceptance-gate
exception were explained, the user instructed the agent to generate the
installer. Under that authorization, the current source manifests now record
all 650 rebuilt SHA-256 identities and the dependency locks record their actual
SHA-512 integrities. The original manifests remain byte-preserved in
`UPSTREAM_017_SOURCE_MANIFEST.original.md` and
`UPSTREAM_020_SOURCE_MANIFEST.original.md`; a regression pins their complete
normalized document hashes. Every current archive remains subject to the
existing complete SHA-256 checks. No behavior regression is removed or skipped.

All generated packages, dependencies, checkouts, detailed hash comparisons and
build logs stay ignored. The full offline `npm run verify:upstream` gate must
pass before creating the desktop `0.2.0-rc.3` release artifacts. The local repair
changes only the Models capability Remote contract and its regression coverage.
