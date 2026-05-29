# n8n Workflow Builder

This workspace is for building, updating, and managing n8n workflows on a self-hosted remote n8n instance. Use the **n8n MCP Server** ([czlonkowski/n8n-mcp](https://github.com/czlonkowski/n8n-mcp)) for all live instance interactions and the bundled **n8n skills** ([czlonkowski/n8n-skills](https://github.com/czlonkowski/n8n-skills)) for workflow design expertise. The skills activate automatically from context — no manual invocation needed.

> **Safety rule**: Never edit production workflows directly with AI. Always build and test in a dev/staging environment first.

---

## MCP tools reference

### Core tools (no credentials required)
These work without connecting to an n8n instance and should be used during design and research.

| Tool | Purpose |
|---|---|
| `tools_documentation` | Full reference for all MCP tools — read this when unsure about a tool |
| `search_nodes` | Find nodes by name, type, or capability; supports community nodes |
| `get_node` | Get full node details, property docs, versions (modes: minimal/standard/full/docs) |
| `validate_node` | Check a single node config (modes: minimal = fast, full = comprehensive) |
| `validate_workflow` | Check an entire workflow structure and AI-agent compatibility |
| `search_templates` | Search 2,352+ templates by keyword, nodes used, task, or metadata |
| `get_template` | Retrieve a complete workflow template JSON |

### n8n instance management tools (require `N8N_API_URL` + `N8N_API_KEY`)

**Workflow operations**
| Tool | Purpose |
|---|---|
| `n8n_list_workflows` | List all workflows — always run this first |
| `n8n_get_workflow` | Get full workflow JSON (modes: full/details/structure/minimal) |
| `n8n_create_workflow` | Create a new workflow |
| `n8n_update_full_workflow` | Replace an entire workflow |
| `n8n_update_partial_workflow` | Apply multiple targeted changes in one call (preferred for edits) |
| `n8n_delete_workflow` | Delete a workflow |
| `n8n_validate_workflow` | Validate a workflow on the live instance |
| `n8n_autofix_workflow` | Attempt automatic fixes on a workflow with errors |
| `n8n_workflow_versions` | List version history of a workflow |
| `n8n_deploy_template` | Deploy a template directly to the instance |

**Execution & testing**
| Tool | Purpose |
|---|---|
| `n8n_test_workflow` | Trigger a test run of a workflow |
| `n8n_executions` | List/retrieve/delete executions — use to verify results |

**Credentials**
| Tool | Purpose |
|---|---|
| `n8n_manage_credentials` | Create and manage credentials; retrieve schemas |

---

## Workflow building process

Follow this sequence for every request:

1. **Research templates first** — run `search_templates` before building anything from scratch. 2,352+ templates exist; reuse when possible.
2. **Check existing workflows** — run `n8n_list_workflows` to avoid duplicates and spot reusable patterns.
3. **Look up unfamiliar nodes** — use `search_nodes` and `get_node` to get accurate property names and required parameters. Never guess node config.
4. **Design out loud** — describe the node structure, connections, and data flow before writing any JSON.
5. **Build** — use `n8n_create_workflow` or `n8n_update_partial_workflow` (batch multiple changes in one call, don't make sequential single-operation updates).
6. **Validate with three tiers**:
   - `validate_node` (minimal) on each critical node
   - `validate_node` (full) for comprehensive checks
   - `validate_workflow` for the whole workflow
   - Run `n8n_autofix_workflow` if errors are found
7. **Test** — use `n8n_test_workflow`, then check `n8n_executions` for result and errors.
8. **Activate** — only when the user explicitly asks.

If a request is ambiguous, ask one focused clarifying question before step 1.

---

## Quality standards

These apply to every workflow regardless of type.

**Node naming**
Always rename every node to describe its action. Never leave defaults.
- `Fetch Orders from Shopify` not `HTTP Request`
- `Filter Paid Orders` not `IF`
- `Map to Invoice Schema` not `Set`
- `Send Slack Alert` not `Slack`

**Documentation**
Add at least one Sticky Note per workflow containing: what it does, trigger conditions, required credentials, and any non-obvious gotchas (rate limits, payload shape, known edge cases).

**Error handling**
Every production workflow needs an error path:
- Attach an **Error Trigger** workflow for async failures, or
- Add an explicit error branch after any risky node (HTTP, Code, AI)

**Credentials**
Never hardcode keys, tokens, or passwords in node parameters. Always reference a named credential from the n8n credential store. Use `n8n_manage_credentials` to inspect available credentials.

**Expressions vs Code nodes**
Use n8n expressions (`{{ $json.field }}`, `{{ $now }}`, `{{ $node["NodeName"].json }}`) for data access and simple transforms. Use a Code node only when logic genuinely requires multi-step computation. See the **n8n Expression Syntax** and **n8n Code JavaScript/Python** skills for correct patterns.

**Explicit parameters**
Default parameter values frequently cause runtime failures. Always explicitly set all parameters on every node rather than relying on presets.

**Output field naming**
Use meaningful field names on Set / Edit Fields nodes. Avoid generic names like `data`, `result`, `output` at the top level.

**Connections**
`addConnection` operations require four string parameters: `source`, `target`, `sourcePort`, `targetPort`. IF nodes need explicit `branch` parameters for TRUE/FALSE routing — never leave branch routing implicit.

---

## Per-type guidelines

### Webhook / API workflows
- Validate the incoming payload shape immediately (check required fields; return a 400-equivalent if missing)
- Use a **Respond to Webhook** node early so the caller doesn't time out; process asynchronously after responding
- Secure every webhook trigger with Header Auth or Basic Auth — never leave unauthenticated
- Handle pagination on any API that returns lists; never assume a single-page response

### Data pipelines
- Use **Split in Batches** for datasets over ~100 items
- Build in deduplication (check by ID or unique key before upserting)
- Log a summary at the end: items processed, skipped, errored
- Store the last-run cursor (timestamp or ID) for incremental runs on scheduled pipelines

### AI / LLM pipelines
- Use n8n's native **LangChain nodes** (AI Agent, Chat Model, Tool nodes) — prefer them over raw HTTP calls to LLM APIs
- Set an explicit system prompt on every AI node
- Validate AI output before passing it to downstream systems — never forward raw LLM text unchecked
- Handle token-limit errors explicitly (truncate input and retry, or surface a clear error)
- The **n8n MCP Tools Expert** and **n8n Node Configuration** skills activate automatically for LangChain node setup

### Automations & integrations
- Design for idempotency — running the workflow twice must not create duplicates
- Use IF nodes to guard side-effect actions ("only notify if status actually changed")
- For scheduled workflows, use `n8n_workflow_versions` to track changes over time
