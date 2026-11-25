# LiteLLM Setup Guide

> **Language / 언어:** English | [한국어](LITELLM_KO.md)

This page puts a LiteLLM proxy in front of this repository's bridge, so LiteLLM clients,
including Claude Code through `./bin/claude-litellm`, use GitHub Copilot models.

One bridge is one GitHub Copilot seat. Every request through the gateway, whichever
virtual key sends it, is billed to the operator's seat and follows the operator's
organization policy. That is why the README rates a gateway shared by a team as not
suitable ([Is it right for you?](../README.md#is-it-right-for-you)).

LiteLLM can add virtual keys and request logging; virtual keys also need a PostgreSQL
database, which this setup does not include ([step 4](#4-connect-claude-code)). The path
loses three things the Direct path has: Claude Code's 1M context window, the bridge's model
list in `/model`, and the bridge's own token counting. LiteLLM's cost tracking and budgets
are wrong for Copilot models. See
[What Differs from the Direct Path](#what-differs-from-the-direct-path).

This path is not tested end to end; see [What Is Not Tested](#what-is-not-tested). If you
only need Claude Code on Copilot models, use the
[Direct path](../README.md#quick-start-direct-sdk) instead.

```text
Claude Code or another client -> LiteLLM -> bridge (src/server.mjs) -> @microsoft/copilot-sdk -> GitHub Copilot
```

LiteLLM reaches the bridge through its `anthropic/*` provider, with `api_base` set to the
bridge root. LiteLLM's own `github_copilot/*` provider is a separate integration that does
not use this repository.

Pick the section that matches your situation:

- Someone else runs the gateway and gave you its URL and a key:
  [Connect to an Existing Gateway](#connect-to-an-existing-gateway).
- You want to run the bridge and a new LiteLLM that this repository installs:
  [Run a Gateway](#run-a-gateway).
- You already run a LiteLLM of your own and want it to serve Copilot models:
  [Add the Bridge to an Existing LiteLLM](#add-the-bridge-to-an-existing-litellm).

## Connect to an Existing Gateway

Use this section when someone else runs the gateway and gave you its URL and a key. You
need macOS or Linux (the launcher is a bash script), Claude Code, Node.js, Git and `curl`.
You do not need `npm install` or `copilot login`, because the operator's machine runs the
bridge. Run the commands in one terminal, with your gateway's root URL (no `/v1`) and your
key in place of the examples. If you already cloned this repository, enter its root instead
of cloning again.

```bash
git clone https://github.com/junwoojeong100/cc-mscp-sdk-v2.git
cd cc-mscp-sdk-v2

export LITELLM_BASE_URL="https://litellm.example.com"
export LITELLM_API_KEY="<your virtual key>"

printf 'Authorization: Bearer %s\n' "$LITELLM_API_KEY" |
  curl --silent --show-error --fail -H @- "$LITELLM_BASE_URL/v1/models"
```

Continue only if `curl` succeeds and returns a model list. A connection failure means you
should check the gateway URL; a 401 means you should check the key with the operator.
The list checks gateway access, not whether a model can answer. Its `id` values are valid
aliases for `LITELLM_MODEL`. Replace `claude-sonnet-5` below if that alias is not listed.

```bash
export LITELLM_MODEL="claude-sonnet-5"
./bin/claude-litellm
```

In Claude Code, ask `Reply with OK`. A reply confirms one request through your gateway,
not every feature on this page. Prompts consume the operator's Copilot allowance. Use
`/exit` to leave the client; this does not stop the operator's gateway. If a request fails,
start with [Troubleshooting](#troubleshooting).

Two rules apply:

- `LITELLM_BASE_URL` has no `/v1`. Claude Code appends `/v1/messages`, and `claude-litellm`
  refuses a URL that ends in `/v1`.
- The alias has no `[1m]` or `[NNNk]` suffix. LiteLLM rejects a bracketed name with
  `400 Invalid model name`.

Claude Code maps its Opus, Sonnet and Haiku choices to three family aliases, and it sends
its small background calls to the Haiku alias. If the gateway serves more than one model,
set them:

```bash
export LITELLM_OPUS_MODEL="claude-opus-5.5"
export LITELLM_SONNET_MODEL="claude-sonnet-5"
export LITELLM_HAIKU_MODEL="claude-haiku-4.5"
```

An unset family alias uses the main alias (`LITELLM_MODEL`). The flags
`--litellm-base-url` and `--litellm-model` override the variables. `claude-litellm`
refuses `--model`, `--settings` and `--ghcp-model`.

`claude-litellm` writes Claude Code's provider settings, your key and the gateway URL
included, to a mode-`0600` file:

- A print-mode run (`-p` without `--background` or `--bg`) uses a temporary file and
  deletes it when Claude Code exits.
- Every other launch keeps its file in
  `${XDG_STATE_HOME:-~/.local/state}/claude-code-ghcp-sdk/litellm-settings/`, because
  Claude Code restarts a `/background` job from it after the launcher has exited. The
  next launch other than print mode deletes files there older than 7 days; nothing
  else removes them. Delete that directory yourself when you no longer want your key
  stored there. A `/background` job still using a deleted file cannot restart.

## Run a Gateway

Use this section to run the bridge and LiteLLM yourself. LiteLLM must run on the same
machine as the bridge, because the bridge that `ensure` starts always listens on
`127.0.0.1`. `ALLOW_NON_LOOPBACK` does not change that.

You need the [README requirements](../README.md#requirements), steps 1 and 2 of the
[Direct quick start](../README.md#quick-start-direct-sdk) (`npm install` and
`copilot login`), and `uv`, which setup uses to create a Python 3.13 environment. If you
already run a LiteLLM of your own you do not need `uv`; do only steps 1 and 2 here, then
continue with [Add the Bridge to an Existing LiteLLM](#add-the-bridge-to-an-existing-litellm).
Run every
command from the repository root. Use **terminal A** for the bridge and LiteLLM server,
and **terminal B** for the client. The server command stays in the foreground; do not
paste the client commands into terminal A while it is running.

### 1. Pin the bridge port in your shell profile

Every `claude` or `claude-ghcp` launch on this machine, except a print-mode run (`-p`
without `--background` or `agents`), uses one shared background bridge
([The background bridge](../README.md#the-background-bridge)). A launch that asks for
another port, or for none, replaces the gateway's bridge. A plain `claude` counts when this
checkout's `bin/` is on your PATH. Add this line to your shell profile (for example
`~/.zshrc`):

```bash
export GHCP_BRIDGE_PORT=4142
```

A profile edit reaches only shells opened afterwards. Reopen terminal A and every terminal
you will use for `claude` or `claude-ghcp`, or run the same `export` line in each one you
keep open.

With `GHCP_BRIDGE_PORT` exported, a print-mode run starts its private bridge on the same
port. While the gateway's bridge holds that port, the run fails with
`GitHub Copilot model is unavailable: <model>`. Clear the variable for print mode:

```bash
GHCP_BRIDGE_PORT= ./bin/claude-ghcp -p "..."
```

Passing another `--bridge-port` also works.

The core verifier starts its own direct, slot-local bridges on free loopback ports;
it does not use this gateway or the shared launcher daemon. Its all-six command and
limits are in [Testing](TESTING.md). A core result does not verify the LiteLLM path.

### 2. Start the bridge and capture its token

In **terminal A**, enter the repository root. Use an ordinary shell with the environment
your other terminals get, including `GHCP_BRIDGE_PORT=4142` from step 1. If its bridge
variables differ from theirs, your next `claude` launch replaces this bridge
([When the Bridge Is Replaced](#when-the-bridge-is-replaced)).

```bash
if [ -z "$GHCP_BRIDGE_PORT" ]; then
  echo "GHCP_BRIDGE_PORT is not set: do step 1, then open a new shell." >&2
else
  export GHCP_BRIDGE_URL="http://127.0.0.1:$GHCP_BRIDGE_PORT"
  unset GHCP_BRIDGE_TOKEN
  BRIDGE_JSON="$(node src/bridge-daemon.mjs ensure claude-sonnet-5 "$GHCP_BRIDGE_PORT")" &&
    export GHCP_BRIDGE_TOKEN="$(printf '%s' "$BRIDGE_JSON" |
      node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')"
fi
```

The block sets `GHCP_BRIDGE_URL` to the bridge root, with no `/v1`, and runs `ensure`.
`ensure` starts the bridge, or reuses the running one if its configuration matches, and
returns one JSON line; the block stores its `token` field, the bridge credential, in
`GHCP_BRIDGE_TOKEN`. The JSON reaches `node` through a pipe, not as an argument, because
any local user can read a process's arguments. For the same reason every `curl` check in
this guide reads its key header from stdin (`-H @-`), written by the shell builtin `printf`.
On success the block prints nothing, and the checks below confirm the bridge. If
`GHCP_BRIDGE_PORT` is empty, the block prints the message above and starts nothing. If `ensure` fails, it prints the reason and `GHCP_BRIDGE_TOKEN` is left unset.

The model argument must be a model your Copilot account can use, and `ensure` checks it.
It does not limit which aliases LiteLLM can serve.

Check the bridge:

```bash
curl --silent --show-error --fail "$GHCP_BRIDGE_URL/health"

printf 'x-api-key: %s\n' "$GHCP_BRIDGE_TOKEN" |
  curl --silent --show-error --fail -H @- "$GHCP_BRIDGE_URL/v1/models?all=true"
```

The first call must return JSON with `"ok": true`; the second must return a model list.
If either fails, stop here and use [Troubleshooting](#troubleshooting). These checks confirm
the bridge and token work, not a completed model response.

The second call lists every model ID in your Copilot catalogue. Those IDs are what goes
after `anthropic/` in the LiteLLM config. `./bin/ghcp-models` prints the same IDs, except
`claude-fable-*`, without going through the bridge. Plain `/v1/models` without `?all=true`
lists at most the three GPT-6 rows that Claude Code's `/model` discovery uses, so do not
check models against it.

Every bridge route except `GET /health` and `HEAD /api/hello` needs the token, sent as
`x-api-key` or `Authorization: Bearer`. Anyone with the token can use your Copilot seat, so
treat it like a password ([Security Boundaries](ARCHITECTURE.md#security-boundaries)).
The exported `GHCP_BRIDGE_TOKEN` does not affect `claude` or `claude-ghcp` launched from
this shell: they set their own token for each command they run.

### 3. Install and start LiteLLM

If you already run a LiteLLM of your own, skip this step and continue with
[Add the Bridge to an Existing LiteLLM](#add-the-bridge-to-an-existing-litellm).

In **terminal A**, in the same shell as step 2, install the local runtime once.
`npm run litellm:setup` downloads LiteLLM v1.97.0 into `.runtime/` and creates a master key
there:

```bash
npm run litellm:setup
```

If setup fails, resolve the error before continuing. When it succeeds, start the server:

```bash
npm run litellm:start
```

`litellm:start` reads `GHCP_BRIDGE_URL` and `GHCP_BRIDGE_TOKEN` from this shell. It refuses
to start without them, or when `GHCP_BRIDGE_URL` ends in `/v1`. By default it loads
[`examples/litellm-github-copilot.yaml`](../examples/litellm-github-copilot.yaml), which
needs no edits. That file defines six aliases, all pointing at the bridge:
`claude-opus-5.5`, `claude-sonnet-5`, `claude-haiku-4.5`, `gpt-6-astra`, `gpt-6-sol` and
`gpt-6-luna`.

LiteLLM listens on `127.0.0.1:4000`. `LITELLM_HOST` and `LITELLM_PORT` change the address,
and `LITELLM_CONFIG` changes the config file. Keep this terminal open. It prints
`Application startup complete` when LiteLLM is ready.

LiteLLM reads the token once, at startup, from terminal A's shell. Whenever the bridge is
replaced, restart it in terminal A: press Ctrl-C, get the new token, then run
`npm run litellm:start`; see [When the Bridge Is Replaced](#when-the-bridge-is-replaced).

### 4. Connect Claude Code

In **terminal B**, enter the same repository root as terminal A. Keep terminal A running.
Load the local key and check gateway access:

```bash
export LITELLM_BASE_URL="http://127.0.0.1:4000"
export LITELLM_API_KEY="$(tr -d '\n' < .runtime/litellm-master-key)"
export LITELLM_MODEL="claude-sonnet-5"

printf 'Authorization: Bearer %s\n' "$LITELLM_API_KEY" |
  curl --silent --show-error --fail -H @- "$LITELLM_BASE_URL/v1/models"
```

Continue only when the list contains `claude-sonnet-5`. If the key file is missing, check
that terminal B is in the right checkout and step 3 succeeded. For connection or HTTP
errors, inspect terminal A and [Troubleshooting](#troubleshooting).

```bash
./bin/claude-litellm
```

Ask `Reply with OK` to check one real response, then use `/exit` to leave the client.
This consumes Copilot allowance and does not establish full end-to-end compatibility.
The rules in [Connect to an Existing Gateway](#connect-to-an-existing-gateway) also apply.
That section also says where this launch keeps its settings file, which here holds the
master key.

This project does not recommend sharing the gateway: every request anyone sends through it
runs on your one Copilot seat and your organization's policy
([Is it right for you?](../README.md#is-it-right-for-you)). Others can reach it only if you
set `LITELLM_HOST` to a network address. If you share it anyway, never hand out the master
key, which controls the whole gateway; give each person a
[virtual key](https://docs.litellm.ai/docs/proxy/virtual_keys) instead. Virtual keys need a
PostgreSQL database set with `DATABASE_URL`; without one, LiteLLM's `/key/generate` fails
with `DB not connected`. The example config and `npm run litellm:start` set up no database,
and this repository does not test one.

### 5. Optional: change the config

To add, rename or remove aliases, copy the example file, edit the copy, and start LiteLLM
with `LITELLM_CONFIG=<copy> npm run litellm:start`. One of the six entries, and the general
settings:

```yaml
model_list:
  - model_name: claude-sonnet-5
    litellm_params:
      model: anthropic/claude-sonnet-5
      api_base: os.environ/GHCP_BRIDGE_URL
      api_key: os.environ/GHCP_BRIDGE_TOKEN

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  forward_client_headers_to_llm_api: true
```

| Field | Set it to | Why |
|---|---|---|
| `model_name` | Any name without `[1m]` or `[NNNk]` | It is the alias clients ask for (`LITELLM_MODEL`). LiteLLM rejects a bracketed name. |
| `model: anthropic/<id>` | A Copilot model ID from `./bin/ghcp-models` | LiteLLM sends everything after `anthropic/` as the request's `model`. The bridge strips a `[1m]` suffix here and picks the Copilot context tier by model ([details](ARCHITECTURE.md#model-discovery-and-context)). |
| `api_base` | The bridge root, with no path | LiteLLM appends `/v1/messages`. `litellm:start` refuses a `GHCP_BRIDGE_URL` ending in `/v1`, but it does not check a literal `api_base` in your own file. Such a value gets `404 not_found_error`. |
| `api_key` | `os.environ/GHCP_BRIDGE_TOKEN` | LiteLLM sends it as `x-api-key`, which the bridge accepts. |
| `forward_client_headers_to_llm_api` | `true` | It passes Claude Code's `x-claude-code-session-id` and `x-claude-code-agent-id` headers to the bridge. The bridge uses them to keep each conversation and each subagent in its own Copilot session. |
| `forward_llm_provider_auth_headers` | Leave it unset | It forwards the client's own `x-api-key`, which overrides `api_key`. |

### 6. Stop

Press Ctrl-C in terminal A to stop LiteLLM.

To stop the bridge as well, first save any `bridge.log` lines you need
([Diagnostics](DIAGNOSTICS.md)), then run `./bin/claude-ghcp-stop`. It stops the bridge and
any replaced bridge that is still running, and deletes `bridge.log` and the per-launch
settings files. Every `claude` or `claude-ghcp` session on this machine that uses those
bridges (all but print-mode runs) loses its connection. It does not touch the settings
files `claude-litellm` keeps, which hold the LiteLLM key they were launched with
([where](#connect-to-an-existing-gateway)).

Neither the bridge nor LiteLLM starts again by itself after a reboot. To restart the
gateway, open terminal A, repeat step 2 there, then run `npm run litellm:start` in the same
shell. Setup does not need to run again.

Stopping services does not undo step 1 or remove `.runtime/` and its master key. If you
are finished operating the gateway, remove the `GHCP_BRIDGE_PORT=4142` line you added to
your shell profile and run `unset GHCP_BRIDGE_PORT` in every terminal still open. Keep the
profile setting if you intend to restart the gateway.

Keep `.runtime/` too if you will run the gateway again. To remove it, first stop LiteLLM
(Ctrl-C in terminal A) and copy out any file you added under `.runtime/` yourself. Then run
this from the root of this checkout; it deletes only this checkout's `.runtime/`, master
key included:

```bash
[ -f scripts/setup-litellm.sh ] && rm -rf .runtime
```

Afterwards, `npm run litellm:start` refuses to start until you run `npm run litellm:setup`
again. Setup downloads LiteLLM again and creates a new master key, so reload
`LITELLM_API_KEY` in terminal B after it. The settings files that `claude-litellm` kept
still contain the old master key; delete
`${XDG_STATE_HOME:-~/.local/state}/claude-code-ghcp-sdk/litellm-settings/` as well if you
want no copy of it left.

That ends the gateway you started here. Skip the next section, which is for a LiteLLM you
already run, and continue with [When the Bridge Is Replaced](#when-the-bridge-is-replaced) to
see what to do when the bridge gets a new token.

## Add the Bridge to an Existing LiteLLM

Use this section when you already run a LiteLLM proxy of your own and want it to serve Copilot
models through this repository's bridge, instead of the LiteLLM that `npm run litellm:setup`
installs. Your LiteLLM keeps its models, keys and settings. You add the bridge to it as one
more backend, then connect Claude Code to your LiteLLM as to any other gateway.

Before you start:

- **Same machine.** LiteLLM must run on the machine that runs the bridge, as a process that
  can reach `127.0.0.1` there. The bridge that `ensure` starts listens only on loopback, and
  this repository does not support exposing it on a network
  ([Security Boundaries](ARCHITECTURE.md#security-boundaries)). A LiteLLM on another machine,
  or in a container with its own network, cannot reach that address, and this repository has
  not tested such a setup.
- **Bridge prerequisites.** The [README requirements](../README.md#requirements) and steps 1
  and 2 of the [Direct quick start](../README.md#quick-start-direct-sdk) (`npm install` and
  `copilot login`). You do not need `uv`.
- **LiteLLM version.** What this section says about LiteLLM's own behaviour is written for
  v1.97.0, the version `npm run litellm:setup` installs, and is not tested
  ([What Is Not Tested](#what-is-not-tested)).

### 1. Start the bridge

Do steps 1 and 2 of [Run a Gateway](#run-a-gateway): pin the bridge port, then start the
bridge and capture its token. Skip step 3, which would install a second LiteLLM. After step 2,
the shell you ran it in holds `GHCP_BRIDGE_URL` (the bridge root, with no `/v1`) and
`GHCP_BRIDGE_TOKEN`, and the `/v1/models?all=true` check there has listed the Copilot model
IDs you can use below.

### 2. Add the models to your config

Add the entries below to your LiteLLM config file, under the top-level keys it already has.
YAML keeps only the last copy of a repeated key, so a second `model_list:` or
`litellm_settings:` block would silently replace the first.

```yaml
model_list:
  # ...your existing models...
  - model_name: copilot-claude-sonnet-5
    litellm_params:
      model: anthropic/claude-sonnet-5
      api_base: os.environ/GHCP_BRIDGE_URL
      api_key: os.environ/GHCP_BRIDGE_TOKEN

litellm_settings:
  # ...your existing settings...
  model_group_settings:
    forward_client_headers_to_llm_api:
      - copilot-claude-sonnet-5
```

Add one `model_list` entry for each Copilot model you want (the example config has six), with
an ID from `./bin/ghcp-models` after `anthropic/`, and list every new `model_name` under
`forward_client_headers_to_llm_api`. [Step 5](#5-optional-change-the-config) explains the
fields. Four things differ when the LiteLLM already serves other models:

- **Give every alias a new name.** LiteLLM treats `model_list` entries that share a
  `model_name` as one group and spreads requests across them. If `claude-sonnet-5` already
  points at another provider, reusing it sends some of that provider's requests to your
  Copilot seat and some Copilot requests to that provider. The `copilot-` prefix is only a
  suggestion. As everywhere in this guide, an alias must not contain `[1m]` or `[NNNk]`.
- **Forward client headers for these aliases only.** The bridge needs Claude Code's
  `x-claude-code-session-id` and `x-claude-code-agent-id` headers; without them it runs all
  requests one at a time, as one conversation. `model_group_settings` forwards a request's
  headers only when the request names a listed alias. The example config's
  `general_settings.forward_client_headers_to_llm_api: true` also works, but it passes every
  `x-` header from every client to every provider your gateway calls. Use it only if your
  LiteLLM has no `model_group_settings`.
- **Check `forward_llm_provider_auth_headers`.** It is off unless you set it, and it applies
  to the whole gateway. If your gateway turns it on for other models, a request that carries
  its own `x-api-key` sends that key to the bridge instead of the bridge token, and the
  bridge answers `401`. `claude-litellm` sends no `x-api-key`; another client might.
- **Keep `timeout` long.** A turn can show no output for a minute or longer, and the bridge
  lets one run for up to 30 minutes
  ([Rate limits and timeouts](../README.md#rate-limits-and-timeouts)). A `timeout` in these
  entries' `litellm_params`, or in your `router_settings`, that expires first ends the request
  with `408 litellm.Timeout`.

### 3. Restart LiteLLM with the bridge variables

LiteLLM reads `os.environ/` values once, when it loads the config. Start your LiteLLM again,
the way you normally start it, with `GHCP_BRIDGE_URL` and `GHCP_BRIDGE_TOKEN` in its
environment. From the shell of step 1 that can be:

```bash
litellm --config /absolute/path/to/your-config.yaml
```

If a service manager starts LiteLLM, set both variables in the service's environment: a
variable exported in another shell does not reach it.

### 4. Connect a client

Follow [Connect to an Existing Gateway](#connect-to-an-existing-gateway) with your LiteLLM's
root URL and a key it accepts. The bridge runs from this checkout, so you do not need to
clone again. Its model-list check should now include your Copilot aliases. Then start Claude
Code on one of them. If you serve more than one Copilot model, also set `LITELLM_OPUS_MODEL`,
`LITELLM_SONNET_MODEL` and `LITELLM_HAIKU_MODEL` to your aliases.

```bash
export LITELLM_MODEL="copilot-claude-sonnet-5"
./bin/claude-litellm
```

In Claude Code, ask `Reply with OK`. A reply confirms one request through your LiteLLM and
the bridge, not every feature on this page, and it consumes Copilot allowance. Use `/exit` to
leave the client; the bridge and your LiteLLM keep running. That completes the setup.
[Keep it working](#keep-it-working) says what to watch from here, and
[Troubleshooting](#troubleshooting) covers a failed request.

### Keep it working

- **The bridge is not permanent.** A reboot or `./bin/claude-ghcp-stop` stops it, and a
  replaced bridge has a new token. Either way LiteLLM must read a new token, which means
  restarting it, and that interrupts every model your LiteLLM serves.
  [When the Bridge Is Replaced](#when-the-bridge-is-replaced) lists the causes and fixes.
- **Every request to these aliases runs on your Copilot seat**, whichever key sends it
  ([Is it right for you?](../README.md#is-it-right-for-you)). If other people use your
  LiteLLM, keep their keys and teams from calling the Copilot aliases by limiting each key's
  or team's `models`. That needs [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
  and their PostgreSQL database, and this repository does not test it.
- **Cost dashboards and budgets** count these requests at LiteLLM's own prices, not at what
  GitHub Copilot charges ([What Differs from the Direct Path](#what-differs-from-the-direct-path)).
- **Stopping.** `/exit` leaves only the client. Stop your LiteLLM the way you normally do. To
  stop the bridge too, first save any `bridge.log` lines you need
  ([Diagnostics](DIAGNOSTICS.md)), then run `./bin/claude-ghcp-stop`; every `claude` or
  `claude-ghcp` session on this machine that uses the bridge (all but print-mode runs) loses
  its connection ([step 6](#6-stop) of Run a Gateway). To drop the Copilot models from your
  LiteLLM, delete their entries from your config and restart it. The settings file
  `claude-litellm` keeps holds your LiteLLM key
  ([where](#connect-to-an-existing-gateway)).

## When the Bridge Is Replaced

The gateway breaks when the bridge on port 4142 goes away or gets a new token. LiteLLM
keeps the token it read at startup, so run every fix below in terminal A, in this order:
press Ctrl-C if LiteLLM is still running, get the token as the row says (step 2 or
`bridge.json`), then run `npm run litellm:start`. LiteLLM reads the token only from the
shell that starts it, so exporting it in terminal B has no effect. If the LiteLLM is your
own ([Add the Bridge to an Existing LiteLLM](#add-the-bridge-to-an-existing-litellm)), read
"terminal A" as the shell that starts it, and `npm run litellm:start` as starting your
LiteLLM again with the new token exported.

| Cause | What LiteLLM gets | Fix |
|---|---|---|
| A `claude` or `claude-ghcp` launch (not `-p`) without `GHCP_BRIDGE_PORT=4142`, or with another `--bridge-port`. A plain `claude` counts when this checkout's `bin/` is on your PATH. | Nothing at first. The launch starts a new bridge on another port, and the old bridge keeps answering LiteLLM. The old bridge exits once no launcher that started on it is still running and it has had no request for `RETIRED_IDLE_MS` (1 hour by default). LiteLLM's own requests count, so this happens after LiteLLM has been idle that long. From then on, LiteLLM's connections to port 4142 are refused. | In terminal A, press Ctrl-C if LiteLLM is still running, re-run step 2, then run `npm run litellm:start`. Apply step 1's `export` in every terminal so it does not happen again. |
| A launch or `ensure` on port 4142 after the bridge's configuration changed: an edit or a pull that changes `src/*.mjs`, `package.json` or `package-lock.json`, a launch from a moved, renamed or second clone, or a bridge variable such as `LOG_LEVEL`, `COPILOT_*` or `HOME` that is set, unset or changed. | `401 authentication_error` with `Invalid bridge credential.`, at once. The old bridge is stopped, and the new bridge on port 4142 has a new token. | In terminal A, press Ctrl-C if LiteLLM is still running, export the new token from `bridge.json` (below) as `GHCP_BRIDGE_TOKEN`, then run `npm run litellm:start`. |
| `./bin/claude-ghcp-stop`, or a reboot | Its connections to port 4142 are refused. | In terminal A, press Ctrl-C if LiteLLM is still running, re-run step 2, then run `npm run litellm:start`. |

`./bin/claude-ghcp-status` tells the rows apart. A `port` other than 4142 means the first
row. `"running": false` means the third. It never prints the token.

The token is in `bridge.json`, in the bridge's daemon directory:

| When | Path |
|---|---|
| `GHCP_DAEMON_DIR` is set | `$GHCP_DAEMON_DIR/bridge.json` |
| macOS | `~/Library/Caches/claude-code-ghcp-sdk/bridge.json` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/claude-code-ghcp-sdk/bridge.json` |

In terminal A, after pressing Ctrl-C, run this on macOS, then `npm run litellm:start`. On
Linux, or with `GHCP_DAEMON_DIR` set, replace the path with the one from the table:

```bash
export GHCP_BRIDGE_TOKEN="$(node -pe \
  'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).token' \
  ~/Library/Caches/claude-code-ghcp-sdk/bridge.json)"
```

For the second row, read the file rather than re-running step 2. `ensure` returns the
running bridge's token only when the calling shell's bridge variables match that bridge.
From a shell whose bridge variables differ, it replaces the bridge again, with another new
token, and the sessions using the old one lose their connection. The full list of what
counts as a configuration change is in
[Persistent Bridge and Retirement](ARCHITECTURE.md#persistent-bridge-and-retirement).

## What Differs from the Direct Path

- **Context window.** Claude Code gives every alias its default 200K window, because an
  alias cannot carry the `[1m]` hint that gives Claude Code a 1M window. `claude-litellm`
  sets no context override. For a 1M window in Claude Code, use the Direct path
  ([Models](../README.md#models)).
- **`/model`.** The picker shows the Opus, Sonnet and Haiku rows, labelled
  `LiteLLM · <alias>`, plus `LITELLM_MODEL` when it is none of those. It does not show the
  bridge's GitHub Copilot model list.
- **Token counting.** LiteLLM answers Claude Code's `/v1/messages/count_tokens` requests
  with its own estimate. They never reach the bridge.
- **Cost and budgets.** LiteLLM prices requests from its own price list, not from what
  GitHub Copilot charges. Its cost dashboard and spend budgets are therefore wrong for these
  models. Check usage against your GitHub Copilot AI Credits instead.
- **Sampling controls.** `temperature`, `top_p`, `max_tokens` and `stop_sequences` have no
  effect on either path; see [Unsupported Controls](COMPATIBILITY.md#unsupported-controls).
- **Errors.** The bridge returns the same statuses as on the Direct path; see
  [Upstream Errors](DIAGNOSTICS.md#upstream-errors) and
  [Rate limits and timeouts](../README.md#rate-limits-and-timeouts). On a streamed request,
  a failure before the first streamed text, reasoning or tool-call delta gets that HTTP
  status. A failure after it arrives as an `event: error` frame with the same error type, on
  a response whose status is already `200`. Each failed `/v1/messages` request writes a
  `bridge.request_failed` line to `bridge.log` in the daemon directory
  ([Logging](DIAGNOSTICS.md#logging)).

## What Is Not Tested

`npm run verify` never starts LiteLLM: it runs Claude Code against the bridge directly.
`npm test` covers only the `claude-litellm` launcher and the settings file it writes, with a
stand-in for Claude Code. Nothing tests `npm run litellm:setup`, `npm run litellm:start`, the
example config or adding the bridge to a LiteLLM you already run. Everything this page says
about LiteLLM's own behaviour (the URL it builds, the headers it forwards and for which model
names, the names it rejects, how it groups entries that share a `model_name`, when it times
out, how it answers `count_tokens`, how it prices requests) is written for v1.97.0, the
version `npm run litellm:setup` installs, and is not tested. Whether LiteLLM passes a bridge
`429` or `529` to its client unchanged, or retries it first, is not tested either. For the
six-scenario live suite's scope, see
[What works and what does not](../README.md#what-works-and-what-does-not).

## Troubleshooting

### `GHCP_BRIDGE_URL is required: the bridge root, with no /v1 suffix.`

`npm run litellm:start` ran in a shell without the variables from
[step 2](#2-start-the-bridge-and-capture-its-token). Run it in terminal A, the shell where
you ran step 2.

### `GHCP_BRIDGE_TOKEN is required: the token printed by bridge-daemon ensure.`

Either `npm run litellm:start` ran in a shell other than terminal A, or step 2's `ensure`
failed and left the token unset. Run it in terminal A. If the token is missing there too,
re-run [step 2](#2-start-the-bridge-and-capture-its-token) in terminal A and read the reason
`ensure` prints.

### `GHCP_BRIDGE_URL must not end in /v1; LiteLLM appends /v1/messages.`

Set `GHCP_BRIDGE_URL` to the bridge root, `http://127.0.0.1:4142`.

### `Invalid LiteLLM base URL: URL must not end in /v1; Claude Code appends /v1/messages`

Remove `/v1` from `LITELLM_BASE_URL` or `--litellm-base-url`.

### LiteLLM cannot connect to the bridge

No bridge is listening on the port LiteLLM uses, so the connection is refused. Run
`./bin/claude-ghcp-status`. A `port` other than 4142 means a launch without
`GHCP_BRIDGE_PORT` replaced the gateway's bridge. `"running": false` means the bridge was
stopped or the machine rebooted. Both fixes are in
[When the Bridge Is Replaced](#when-the-bridge-is-replaced).

### `401` `authentication_error`: `Invalid bridge credential.`

LiteLLM is using an old token. Either the bridge on 4142 was replaced, or LiteLLM was
started with a different token in a shell other than terminal A. In terminal A, press
Ctrl-C if LiteLLM is still running, export the current token from `bridge.json` as
`GHCP_BRIDGE_TOKEN`, then run `npm run litellm:start`; see
[When the Bridge Is Replaced](#when-the-bridge-is-replaced).

### `400 Invalid model name` from LiteLLM

The alias the client asked for is not a `model_name` in LiteLLM's config, because of a typo
or a `[1m]` or `[NNNk]` suffix. The bridge never sees the request. Use an `id` from
LiteLLM's `/v1/models`. With `claude-litellm`, check `LITELLM_MODEL`, `--litellm-model` and
the three family aliases.

### `GitHub Copilot model "<id>" is unavailable. Available adapter models: …`

This comes from the bridge, as `400 invalid_request_error`. The string after `anthropic/`
in the config is not a model the bridge can resolve. The message lists the IDs it can use,
and `./bin/ghcp-models` prints the same list.

### `GitHub Copilot model is unavailable: <model>`

From step 2, the model you passed to `ensure` is not available to your Copilot account.
Pick one from `./bin/ghcp-models`.

From a `claude -p` or `claude-ghcp -p` run on the gateway machine, with an `HTTP 401` line
just before it, the private bridge tried to use the gateway's port. Run print mode with
`GHCP_BRIDGE_PORT=` cleared; see [step 1](#1-pin-the-bridge-port-in-your-shell-profile).

### `404` `not_found_error`: `Not found.`

The `api_base` in your own config has a path, usually `/v1`. Use scheme, host and port only.

### Requests from different conversations wait for each other

Your config lacks `forward_client_headers_to_llm_api: true`; the example file sets it.
Without it the bridge cannot tell conversations or subagents apart, so it runs all their
requests one at a time, as one conversation.

### Requests for an existing alias reach the bridge, or Copilot requests reach another provider

Two `model_list` entries share a `model_name`, so LiteLLM spreads that alias's requests across
both. Give the Copilot entries names your config does not already use, and use those names as
the aliases ([Add the Bridge to an Existing LiteLLM](#2-add-the-models-to-your-config)).

### `408` `litellm.Timeout` on a long turn

A `timeout` in the entry's `litellm_params`, or in your `router_settings`, expired before the
bridge answered. A turn can show no output for a minute or longer and run for up to 30 minutes
([Rate limits and timeouts](../README.md#rate-limits-and-timeouts)). Raise the `timeout` for
the Copilot entries.

### LiteLLM does not start because port 4000 is in use

In **terminal A**, start LiteLLM on another port and leave it running:

```bash
LITELLM_PORT=4001 npm run litellm:start
```

In **terminal B**, point the client at that port before repeating step 4's model-list check
and client launch:

```bash
export LITELLM_BASE_URL="http://127.0.0.1:4001"
```

## Official Documentation

- [LiteLLM Anthropic provider](https://docs.litellm.ai/docs/providers/anthropic)
- [LiteLLM Anthropic Messages endpoint](https://docs.litellm.ai/docs/anthropic_unified)
- [LiteLLM virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys)
- [LiteLLM load balancing](https://docs.litellm.ai/docs/proxy/load_balancing)
- [LiteLLM forward client headers](https://docs.litellm.ai/docs/proxy/forward_client_headers)
- [LiteLLM Claude Code quickstart](https://docs.litellm.ai/docs/tutorials/claude_responses_api)
- [LiteLLM Claude Code compatibility matrix](https://docs.litellm.ai/docs/claude_code_compatibility)
