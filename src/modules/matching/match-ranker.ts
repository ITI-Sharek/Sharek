import { ShortlistedMatch } from './matching.service';

/**
 * An optional re-ranker over an already-computed deterministic shortlist.
 *
 * This is the seam the AI ranking agent (AI_Agents `P1-A01`) binds to. It is a
 * port with no implementation in this repository, and the platform is fully
 * functional without one: nothing here waits for it, and a shortlist is a
 * finished answer before it is ever consulted.
 *
 * The contract is deliberately narrow. A ranker may **reorder** matches; it may
 * not add, remove, or edit them. So a ranker cannot surface a Request the
 * deterministic exclusions rejected, cannot invent a justification, and cannot
 * raise a contributor above their entitlement cap — the worst a broken or
 * hostile ranker can do is return a worse order, and
 * {@link MatchRanker.rerank} failing at all leaves the deterministic order in
 * place rather than failing the request.
 */
export abstract class MatchRanker {
  abstract rerank(input: {
    contributorId: string;
    matches: ShortlistedMatch[];
  }): Promise<ShortlistedMatch[]>;
}
