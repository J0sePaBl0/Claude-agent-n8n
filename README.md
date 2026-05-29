# Claude Agent n8n

A Claude Code workspace for building and managing n8n workflows using the [n8n-mcp](https://github.com/czlonkowski/n8n-mcp) server and [n8n-skills](https://github.com/czlonkowski/n8n-skills).

## What this gives you

- **n8n MCP server** — Claude can directly create, edit, validate, and test workflows on your live n8n instance
- **7 n8n skills** — automatic expertise in node configuration, expressions, Code nodes, validation, and workflow patterns

## Prerequisites

Install these before cloning:

- [Git](https://git-scm.com)
- [Node.js + npm](https://nodejs.org) (v18 or higher)
- [Claude Code](https://claude.ai/code)

## Installation

### 1. Clone the repo

```bash
git clone https://github.com/J0sePaBl0/Claude-agent-n8n.git
cd Claude-agent-n8n
```

### 2. Install the n8n-mcp server globally

```bash
npm install -g n8n-mcp
```

### 3. Install the n8n skills into Claude Code

**Windows:**
```powershell
.\install-skills.ps1
```

**Mac/Linux:**
```bash
bash install-skills.sh
```

### 4. Configure your n8n credentials

```bash
cp .mcp.json.example .mcp.json
```

Open `.mcp.json` and fill in your values:

```json
"N8N_API_URL": "https://your-n8n-instance.com/",
"N8N_API_KEY": "your-api-key-here"
```

> Get your API key from n8n: **Settings → API → Create API Key**

### 5. Restart Claude Code

Open Claude Code in the `Claude-agent-n8n` folder. The MCP server and skills activate automatically.

---

## Project structure

```
Claude-agent-n8n/
├── .gitignore            # excludes .mcp.json (keeps credentials local)
├── .mcp.json             # your credentials — created locally, never committed
├── .mcp.json.example     # template for .mcp.json
├── CLAUDE.md             # workflow building instructions for Claude
├── install-skills.ps1    # Windows skill installer
├── install-skills.sh     # Mac/Linux skill installer
└── skills/               # 7 n8n skills (loaded into Claude Code)
    ├── n8n-code-javascript
    ├── n8n-code-python
    ├── n8n-expression-syntax
    ├── n8n-mcp-tools-expert
    ├── n8n-node-configuration
    ├── n8n-validation-expert
    └── n8n-workflow-patterns
```

## Available MCP tools

Once connected, Claude has access to tools that require no credentials (design phase) and tools that interact with your live n8n instance.

**No credentials required**
- `search_nodes` — find nodes by name or capability
- `get_node` — full node documentation and property details
- `validate_node` / `validate_workflow` — check configs before deploying
- `search_templates` — search 2,300+ workflow templates
- `get_template` — retrieve a full template JSON

**Requires N8N_API_URL + N8N_API_KEY**
- `n8n_list_workflows` — list all workflows on your instance
- `n8n_create_workflow` — create a new workflow
- `n8n_update_partial_workflow` — apply targeted edits
- `n8n_test_workflow` — trigger a test run
- `n8n_executions` — inspect execution results
- `n8n_manage_credentials` — manage credential schemas
- And more — see `CLAUDE.md` for the full reference

## Security note

`.mcp.json` is in `.gitignore` and will never be committed. Never share or commit this file — it contains your n8n API key.
