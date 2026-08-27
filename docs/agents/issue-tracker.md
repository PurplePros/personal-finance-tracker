# Issue tracker: Linear (MCP)

Tickets and specs for this repo live in Linear, in the **Guru** project — as
**Issues** and project **Documents** respectively (see [Which Linear entity to
use](#which-linear-entity-to-use)):
https://linear.app/purplepros/project/guru-5d3b63af2ee3/overview

Use the Linear MCP server (`mcp__linear-server__*` tools) for all operations — do not shell out to a Linear CLI or REST API directly. If the MCP tools aren't authenticated yet, run `mcp__linear-server__authenticate` first.

## Conventions

- **Create an issue**: use the Linear MCP's create-issue tool, scoped to the Guru project.
- **Read an issue**: use the Linear MCP's get-issue tool (by ID or URL).
- **List issues**: use the Linear MCP's list-issues tool, filtered to the Guru project; filter further by state/label as needed.
- **Comment on an issue**: use the Linear MCP's create-comment tool.
- **Apply / remove labels**: use the Linear MCP's update-issue tool to set labels.
- **Close / change status**: use the Linear MCP's update-issue tool to set state (e.g. Done, Canceled).

Always scope reads/writes to the Guru project unless the user names a different Linear project or team.

## Which Linear entity to use

Keep specs and tickets in different Linear entities:

- **Specs** (`/to-spec` output, plans, design write-ups, reference material) → a **project Document** in the Guru project (these appear under the project's **Resources**). Never file a spec as an issue.
- **Tickets** (`/to-tickets` output, actionable units of work) → **Issues** in the Guru project. Issues are reserved for tickets only.

So when a skill says **"publish to the issue tracker"**, route by what it produced: a spec becomes a project Document; tickets become Issues.

Use native Issue **blocking relations** (`blockedBy` / `blocks`) for ticket dependency edges — not free text — so the dependency graph is real in Linear.

### Triage label

The `ready-for-agent` triage label does not exist in this workspace yet (labels are Improvement / Bug / Feature). Until it's set up, tag agent-ready tickets `Feature` and record `Status: ready-for-agent` in the body. Run `/setup-matt-pocock-skills` to add the real label.

## Use Mermaid diagrams generously

When a spec, ticket, or document explains a concept that has structure — dependency graphs, state machines, data flows, entity relationships, sequences, the shape of a domain — **draw it as a Mermaid diagram**, not just prose. Prefer a diagram wherever one would make the concept faster to grasp; default to including one rather than omitting it. Linear Documents and Issue descriptions render fenced ```mermaid``` blocks.

## When a skill says "publish to the issue tracker"

Route by entity per **Which Linear entity to use** above: specs → project Document, tickets → Issues.

## When a skill says "fetch the relevant ticket"

Look it up via the Linear MCP's get-issue tool, using the ID or URL the user gave.

## Pull requests as a triage surface

Not applicable — Linear doesn't share PRs into this queue. GitHub PRs for this repo are reviewed normally and linked to their Linear issue via commit/PR references, not treated as triage input.
