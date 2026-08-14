#!/usr/bin/env node
/**
 * Local stand-in for the FastAPI AI service, for exercising the queues end to
 * end without a provider. Serves two routes, chosen by request path:
 *
 *   POST /advisory-fit/assess   -> Advisory Fit findings
 *   POST /requirements/infer    -> inferred required skill levels (P0-B02)
 *
 * The file keeps its Advisory Fit name because that is what every existing
 * runbook and release-gate script invokes.
 *
 * It echoes the request rather than replaying test/fixtures/sprint4-core/
 * advisory-fit-response.json. That fixture's requirement ids and evidence ids
 * belong to its own request, so serving it verbatim against a real Application
 * fails coverage and citation validation every time — which looks exactly like
 * a broken queue.
 *
 *   node scripts/advisory-fit-provider-stub.mjs [--port 8011] [--mode completed] [--delay-ms 0]
 *
 * modes: completed | system_limit | no_assessable_evidence | error | hang
 */
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const port = Number(flag('port', 8011));
const mode = flag('mode', 'completed');
const delayMs = Number(flag('delay-ms', 0));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function completedFor(body) {
  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  const allowed = Array.isArray(body.allowedEvidenceIds) ? body.allowedEvidenceIds : [];
  return {
    // The wire contract uses `status`; `kind` is the internal result type the
    // client maps it onto.
    status: 'COMPLETED',
    // Every field non-blank and <= 200 chars, as the client requires.
    metadata: {
      provider: 'local-stub',
      model: 'stub-v1',
      promptVersion: 'advisory-fit-v1',
      schemaVersion: '1',
      serviceVersion: 'stub',
    },
    // One finding per requirement we were sent, citing only allowed evidence.
    findings: requirements.map((requirement) => ({
      requirementId: requirement.id,
      requirementKind: requirement.kind,
      finding: requirement.kind === 'required' ? 'SUPPORTED' : 'NOT_EVIDENCED',
      confidence: requirement.kind === 'required' ? 'HIGH' : 'LOW',
      citations: allowed.slice(0, 1),
      uncertainty: [],
      explanation: `Stubbed assessment for requirement ${requirement.id}.`,
    })),
  };
}

/**
 * An inferred skill set derived from the Request the backend actually sent.
 *
 * Echoing the input rather than serving a fixture, for the same reason the
 * Advisory Fit stub does: a canned skill list would be rejected by the client's
 * duplicate and cap checks against a real draft, and a rejected response looks
 * exactly like a broken queue.
 */
function inferredFor(body) {
  const tags = Array.isArray(body.technologyTags) ? body.technologyTags : [];
  // One `required` row at minimum, because publication refuses without one and
  // a stub that cannot get a draft published is not exercising the path.
  const names = tags.length > 0 ? tags.slice(0, 15) : ['general-programming'];
  return {
    skills: names.map((name, index) => ({
      skillName: String(name),
      requiredLevel: ['beginner', 'intermediate', 'advanced'][index % 3],
      // The first is required so the draft is publishable; the rest advisory.
      kind: index === 0 ? 'required' : 'preferred',
      confidence: index === 0 ? 'high' : 'medium',
      rationale: `Stubbed inference from the technology tag ${name}.`,
    })),
    metadata: {
      provider: 'local-stub',
      model: 'stub-v1',
      promptVersion: 'requirement-inference-v1',
      schemaVersion: 'requirement-inference-v1',
      serviceVersion: 'stub',
      latencyMs: 5,
    },
  };
}

const server = createServer((request, response) => {
  let raw = '';
  request.on('data', (chunk) => {
    raw += chunk;
  });
  request.on('end', async () => {
    if (delayMs > 0) await sleep(delayMs);
    // Accept the socket and never answer, so the client's AbortController fires.
    if (mode === 'hang') return;

    if (mode === 'error') {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ detail: 'stubbed provider outage' }));
      return;
    }

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    if ((request.url ?? '').startsWith('/requirements/infer')) {
      const payload = inferredFor(body);
      console.log(
        `${request.method} ${request.url} -> ${payload.skills.length} inferred skills`,
      );
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
      return;
    }

    const statusByMode = {
      system_limit: 'NOT_STARTED_SYSTEM_LIMIT',
      no_assessable_evidence: 'NOT_STARTED_NO_ASSESSABLE_EVIDENCE',
    };
    const payload =
      mode === 'completed'
        ? completedFor(body)
        : { status: statusByMode[mode] ?? mode, metadata: { provider: 'local-stub' } };

    console.log(
      `${request.method} ${request.url} -> ${mode}` +
        (mode === 'completed' ? ` (${payload.findings.length} findings)` : ''),
    );
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `AI provider stub listening on http://127.0.0.1:${port} ` +
      `(/advisory-fit/assess mode=${mode}, /requirements/infer always succeeds, delayMs=${delayMs})`,
  );
});
