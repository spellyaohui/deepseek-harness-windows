# Superpowers bundled skills

Local owner: `@deepseek-ai/dsh-superpowers@0.1.1`; not an official DeepSeek package.

Source: [obra/superpowers v7.0.0](https://github.com/obra/superpowers/tree/bb92a77741419a4ab5f06e711a283343f1ada0c3), commit `bb92a77741419a4ab5f06e711a283343f1ada0c3`.
Original tracked skills, references, helpers and MIT LICENSE are preserved byte for byte.
`lib/upstream-manifest.json` records their fixed SHA-256 identities.
Import from raw Git blobs, not a Windows archive/checkout that may apply autocrlf.
The sorted `path<TAB>sha256` list (LF separators, no trailing LF) is independently
pinned to `4b646fcbb694f25c32d5840657cc20becb1b0e9791a9de5d4081898cf09116c7`
by both asset tests and the production closure verifier. Updating asset bytes and
self-reported hashes together does not bypass this original-source check.

Harness `0.2.1-rc.2` owns parsing, discovery, scope precedence, metadata catalogs,
the model `skill` tool and explicit `/skill-name` injection (`UPSTREAM_EQUIVALENT`).
This plugin only registers one native bundled provider and appends `dsh-tools.md`
after its selected skill body (`REAPPLY`). User/project overrides are not decorated.
All runtime files live in authoritative tracked `lib`; no compilation or watcher.

## 0.1.1 local Harness delegation mapping

The Harness-owned dsh-tools.md mapping now directs ordinary Team work to the
saved/current-user Profile and its frozen roles. Explicit temporary delegation
uses `/agent-teams --temporary <goal>` with authority from the whole current
direct user context, never model, skill or historical text. Mapping prose is
secondary to AgentTeams' Schema and execution gate; Native stays separate.
The 75 original files/LICENSE, v7.0.0 source commit and independently pinned
raw-blob digest above remain unchanged. No automatic default Profile selection,
configuration migration, settings writer or new gateway is introduced.
Source/asset regressions preceded the local identity update; final wrapper and
package acceptance are recorded separately in the rc.21 candidate notes.

No new tool, system prompt, settings card, Hook, scheduler, or user-directory install.
AgentTeams and its existing gateway retain Team permissions and lifecycle; Native
delegation remains separate. Existing managed captain subagent compatibility stays.
Automatic selection still depends on the model; successful offline loading is not
proof of real-model selection. Explicit `/` is the supported fallback.

## 0.1.2 host refresh

The peer matrix admits the fixed 0.2.1-rc.2 SDK and cordis4.0.5. All 75 original
assets and 15 skills retain their pinned hashes; no skill-body update is included.
