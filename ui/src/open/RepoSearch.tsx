import { LoaderCircle, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { ForgeRepoHit } from '../api/gen/ForgeRepoHit';
import { forgeName } from '../forge/labels';

interface Group {
  key: string;
  label: string;
  hits: ForgeRepoHit[];
}

/** One section per account: integration, then the account's user and host. */
function groupsOf(hits: ForgeRepoHit[]): Group[] {
  const by = new Map<string, Group>();
  for (const hit of hits) {
    const key = `${hit.project.kind}:${hit.project.host}:${hit.accountId}`;
    const group = by.get(key) ?? { key, label: `${forgeName(hit.project.kind)} · ${hit.accountUsername}@${hit.project.host}`, hits: [] };
    group.hits.push(hit);
    by.set(key, group);
  }
  return [...by.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Search the profile's forge accounts for a repository to clone (no repository open: the
 * Clone screen). Only repositories those accounts own or can access are found, grouped by
 * integration and account. A hit is cloned into the chosen folder, in a folder named after it. */
export function RepoSearch({ disabled, onClone }: { disabled: boolean; onClone: (hit: ForgeRepoHit) => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ForgeRepoHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();
  const groups = useMemo(() => groupsOf(hits), [hits]);
  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      setError(null);
      return;
    }
    let live = true;
    setSearching(true);
    setError(null);
    const timer = setTimeout(() => {
      api.forgeSearchRepos(q).then(
        (found) => { if (live) { setHits(found); setSearching(false); } },
        (e) => { if (live) { setHits([]); setError(errorMessage(e)); setSearching(false); } },
      );
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);
  return (
    <div className="clone-search">
      <span className="clone-divider">Or clone one from your integrations</span>
      <label>
        Search repositories
        <div className="clone-search-box">
          <Search size={13} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Repository name" aria-label="Search repositories" disabled={disabled} spellCheck={false} />
        </div>
      </label>
      {searching && <div className="clone-search-state" role="status"><LoaderCircle size={13} className="spin" /> Searching…</div>}
      {error && <p className="open-error" role="alert">{error}</p>}
      {!searching && !error && q.length >= 2 && hits.length === 0 && <p className="clone-search-state dim">No repositories found.</p>}
      {groups.length > 0 && (
        <div className="clone-hits">
          {groups.map((group) => (
            <section className="clone-search-group" key={group.key} aria-label={group.label}>
              <h3 className="clone-search-group-title">{group.label}</h3>
              <ul className="open-list clone-hit-list">
                {group.hits.map((hit) => (
                  <li key={`${hit.project.kind}:${hit.project.host}/${hit.project.path}`} className="open-recent-item">
                    <button type="button" className="open-row" onClick={() => onClone(hit)} disabled={disabled} aria-label={`Clone ${hit.project.path}`} title={`Clone ${hit.project.path} into the selected folder`}>
                      <span className="open-name">{hit.project.name}</span>
                      <span className="open-path">{hit.project.path}</span>
                      {hit.project.archived && <span className="open-branch">archived</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
