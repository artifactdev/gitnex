import type { HostKind } from '../api/gen/HostKind';
import type { RemotePayload } from '../api/gen/RemotePayload';

/** A remote resolved down to what forge URLs need (spec §14.4). */
export interface ProjectRemote {
  host: string;
  path: string;
  hostKind: HostKind;
  baseUrl?: string;
}

/** The profile's host → forge type overrides (spec §14.4, `Profile.hostOverrides`). */
export type HostOverrides = { [host in string]?: HostKind };

/** A host's forge type: the profile's override for that host (hosts compare case-insensitively),
 * else the one detected from its name. Every forge link, icon and menu row goes through this. */
export function effectiveKind(host: string | null | undefined, detected: HostKind, overrides: HostOverrides): HostKind {
  if (!host) return detected;
  return overrides[host] ?? overrides[host.toLowerCase()] ?? detected;
}

/** The remote that forge links point at: the first with a parsed host and path. Remotes arrive
 * `origin` first (spec §14.4). `overrides` are the profile's host-type overrides. */
export function projectRemote(remotes: RemotePayload[], overrides: HostOverrides = {}, bases: Readonly<Record<string, string | undefined>> = {}): ProjectRemote | null {
  const r = remotes.find((x) => x.host && x.path);
  if (!r) return null;
  const configured = bases[r.host!] ?? bases[r.host!.toLowerCase()];
  const remote: ProjectRemote = { host: r.host!, path: r.path!, hostKind: effectiveKind(r.host, configured ? 'bitbucket' : r.hostKind, overrides) };
  if (remote.hostKind === 'bitbucket') {
    const scm = /^(?:(.*)\/)?scm\/([^/]+\/[^/]+)$/.exec(remote.path);
    remote.baseUrl = configured ?? `https://${remote.host}${scm?.[1] ? `/${scm[1]}` : ''}`;
    if (scm) remote.path = scm[2];
  }
  return remote;
}

/** Percent-encodes each `/`-separated segment, keeping the separators themselves, so a branch or
 * file path containing `#`, spaces or other reserved characters can't break the URL. */
function encodeSegments(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/');
}

/** `https://{host}/{path}`. `project`, when given, replaces `r.path`. */
function baseUrl(r: ProjectRemote, project?: string | null): string {
  if (r.hostKind === 'bitbucket') return bitbucketRepoUrl(r.baseUrl ?? `https://${r.host}`, project ?? r.path);
  if (r.hostKind === 'azuredevops') {
    const [p, repo] = (project ?? r.path).split('/');
    return `https://${r.host}/${encodeURIComponent(p)}/_git/${encodeURIComponent(repo ?? p)}`;
  }
  return `https://${r.host}/${project ?? r.path}`;
}

export function bitbucketRepoUrl(base: string, project: string): string {
  const [key, slug] = project.split('/');
  const owner = key.startsWith('~') ? `users/${encodeURIComponent(key.slice(1))}` : `projects/${encodeURIComponent(key)}`;
  return `${base.replace(/\/+$/, '')}/${owner}/repos/${encodeURIComponent(slug ?? '')}`;
}

/** A full commit SHA (SHA-1 or SHA-256), not a branch name. */
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/** A file's blob URL, with an optional line anchor (spec §14.4). GitLab and GitHub differ in both
 * the path shape and the anchor: GitLab's range anchor has one `L`, GitHub's has two. Forgejo
 * anchors like GitHub, but its path names the ref's type (`ref` is a branch or a full SHA). */
export function fileUrl(r: ProjectRemote, ref: string, file: string, lines?: { a: number; b: number }): string | null {
  if (r.hostKind === 'generic') return null;
  if (r.hostKind === 'azuredevops') {
    const version = `${FULL_SHA.test(ref) ? 'GC' : 'GB'}${ref}`;
    const line = lines ? `&line=${lines.a}&lineEnd=${lines.b}&lineStartColumn=1&lineEndColumn=1` : '';
    return `${baseUrl(r)}?path=${encodeURIComponent(`/${file}`)}&version=${encodeURIComponent(version)}${line}`;
  }
  const encRef = encodeSegments(ref);
  const encFile = encodeSegments(file);
  if (r.hostKind === 'bitbucket') {
    const anchor = lines ? `#${lines.a}${lines.a === lines.b ? '' : `-${lines.b}`}` : '';
    return `${baseUrl(r)}/browse/${encFile}?at=${encodeURIComponent(ref)}${anchor}`;
  }
  if (r.hostKind === 'gitlab') {
    const url = `${baseUrl(r)}/-/blob/${encRef}/${encFile}`;
    if (!lines) return url;
    return `${url}#L${lines.a}${lines.a === lines.b ? '' : `-${lines.b}`}`;
  }
  const url = r.hostKind === 'forgejo'
    ? `${baseUrl(r)}/src/${FULL_SHA.test(ref) ? 'commit' : 'branch'}/${encRef}/${encFile}`
    : `${baseUrl(r)}/blob/${encRef}/${encFile}`;
  if (!lines) return url;
  return `${url}#L${lines.a}${lines.a === lines.b ? '' : `-L${lines.b}`}`;
}

/** The project's home page (a remote's Forge link). */
export function repoUrl(r: ProjectRemote): string | null {
  return r.hostKind === 'generic' ? null : baseUrl(r);
}

export function branchUrl(r: ProjectRemote, branch: string): string | null {
  if (r.hostKind === 'generic') return null;
  if (r.hostKind === 'azuredevops') return `${baseUrl(r)}?version=${encodeURIComponent(`GB${branch}`)}`;
  const enc = encodeSegments(branch);
  if (r.hostKind === 'bitbucket') return `${baseUrl(r)}/browse?at=${encodeURIComponent(`refs/heads/${branch}`)}`;
  if (r.hostKind === 'forgejo') return `${baseUrl(r)}/src/branch/${enc}`;
  return r.hostKind === 'gitlab' ? `${baseUrl(r)}/-/tree/${enc}` : `${baseUrl(r)}/tree/${enc}`;
}

export function commitUrl(r: ProjectRemote, sha: string): string | null {
  if (r.hostKind === 'generic') return null;
  if (r.hostKind === 'azuredevops') return `${baseUrl(r)}/commit/${encodeURIComponent(sha)}`;
  if (r.hostKind === 'bitbucket') return `${baseUrl(r)}/commits/${encodeURIComponent(sha)}`;
  return r.hostKind === 'gitlab' ? `${baseUrl(r)}/-/commit/${sha}` : `${baseUrl(r)}/commit/${sha}`;
}

/** GitLab merge requests; GitHub and Forgejo pull requests (GitHub redirects `/pull/n` to the
 * issue when `n` is one). No API call: plain URL templates (spec §14.4). `project` (a
 * `group/sub/project` or `owner/repo` override) replaces `r.path` when it's non-null. */
export function mergeRequestUrl(r: ProjectRemote, project: string | null, n: number): string | null {
  if (r.hostKind === 'generic') return null;
  if (r.hostKind === 'azuredevops') return `${baseUrl(r, project)}/pullrequest/${n}`;
  if (r.hostKind === 'bitbucket') return `${baseUrl(r, project)}/pull-requests/${n}`;
  if (r.hostKind === 'forgejo') return `${baseUrl(r, project)}/pulls/${n}`;
  return r.hostKind === 'gitlab' ? `${baseUrl(r, project)}/-/merge_requests/${n}` : `${baseUrl(r, project)}/pull/${n}`;
}

export function issueUrl(r: ProjectRemote, project: string | null, n: number): string | null {
  if (r.hostKind === 'generic' || r.hostKind === 'bitbucket' || r.hostKind === 'azuredevops') return null;
  return r.hostKind === 'gitlab' ? `${baseUrl(r, project)}/-/issues/${n}` : `${baseUrl(r, project)}/issues/${n}`;
}
