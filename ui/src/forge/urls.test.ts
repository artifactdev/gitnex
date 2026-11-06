import { describe, expect, it } from 'vitest';
import { branchUrl, commitUrl, effectiveKind, fileUrl, issueUrl, mergeRequestUrl, projectRemote, repoUrl, type ProjectRemote } from './urls';

const gitlab: ProjectRemote = { host: 'gitlab.example.com', path: 'group/project', hostKind: 'gitlab' };
const github: ProjectRemote = { host: 'github.example.com', path: 'owner/repo', hostKind: 'github' };
const forgejo: ProjectRemote = { host: 'forgejo.example.org', path: 'owner/repo', hostKind: 'forgejo' };
const generic: ProjectRemote = { host: 'code.example.com', path: 'a/b', hostKind: 'generic' };
const bitbucket: ProjectRemote = { host: 'bitbucket.example.com:8443', path: 'ORBIT/widget', hostKind: 'bitbucket', baseUrl: 'https://bitbucket.example.com:8443/bitbucket' };

describe('Azure DevOps repository links', () => {
  const remote: ProjectRemote = { host: 'dev.azure.com/orbital', path: 'Space Tools/Orbit App', hostKind: 'azuredevops' };
  const base = 'https://dev.azure.com/orbital/Space%20Tools/_git/Orbit%20App';
  it('uses Azure routes and encodes names, branches and file paths', () => {
    expect(repoUrl(remote)).toBe(base);
    expect(branchUrl(remote, 'feature/x#1')).toBe(`${base}?version=GBfeature%2Fx%231`);
    expect(commitUrl(remote, 'abc1234')).toBe(`${base}/commit/abc1234`);
    expect(fileUrl(remote, 'feature/x', 'src/a file.rs')).toBe(`${base}?path=%2Fsrc%2Fa%20file.rs&version=GBfeature%2Fx`);
    expect(fileUrl(remote, 'a'.repeat(40), 'src/lib.rs')).toBe(`${base}?path=%2Fsrc%2Flib.rs&version=GC${'a'.repeat(40)}`);
    expect(mergeRequestUrl(remote, null, 7)).toBe(`${base}/pullrequest/7`);
    expect(issueUrl(remote, null, 7)).toBeNull();
  });
});

describe('Bitbucket Data Center links', () => {
  const base = 'https://bitbucket.example.com:8443/bitbucket/projects/ORBIT/repos/widget';
  it('uses native repository, branch, commit and PR routes, never issue routes', () => {
    expect(repoUrl(bitbucket)).toBe(base);
    expect(branchUrl(bitbucket, 'feat/x#1')).toBe(`${base}/browse?at=refs%2Fheads%2Ffeat%2Fx%231`);
    expect(commitUrl(bitbucket, 'abc1234')).toBe(`${base}/commits/abc1234`);
    expect(mergeRequestUrl(bitbucket, null, 7)).toBe(`${base}/pull-requests/7`);
    expect(issueUrl(bitbucket, null, 7)).toBeNull();
    expect(mergeRequestUrl(bitbucket, '~nova/widget', 8)).toBe('https://bitbucket.example.com:8443/bitbucket/users/nova/repos/widget/pull-requests/8');
  });
  it('encodes file paths and refs separately, using native line anchors', () => {
    expect(fileUrl(bitbucket, 'feat/x#1', 'a dir/file.md', { a: 3, b: 8 }))
      .toBe(`${base}/browse/a%20dir/file.md?at=feat%2Fx%231#3-8`);
  });
  it('normalizes HTTPS clone paths without affecting other providers', () => {
    const r = projectRemote([{ name: 'origin', host: bitbucket.host, path: 'bitbucket/scm/ORBIT/widget', hostKind: 'bitbucket' }]);
    expect(r).toEqual(bitbucket);
    expect(projectRemote([{ name: 'origin', host: 'gitlab.example.com', path: 'scm/group/widget', hostKind: 'gitlab' }])?.path).toBe('scm/group/widget');
  });
  it('uses configured context paths for SSH repository identities', () => {
    const r = projectRemote([{ name: 'origin', host: bitbucket.host, path: bitbucket.path, hostKind: 'bitbucket' }], {}, { [bitbucket.host]: bitbucket.baseUrl! });
    expect(r).toEqual(bitbucket);
    expect(repoUrl(r!)).toBe(base);
    const unknownHost = [{ name: 'origin', host: bitbucket.host, path: bitbucket.path, hostKind: 'generic' as const }];
    expect(projectRemote(unknownHost, {}, { [bitbucket.host]: bitbucket.baseUrl! })?.hostKind).toBe('bitbucket');
    expect(projectRemote(unknownHost, { [bitbucket.host]: 'generic' }, { [bitbucket.host]: bitbucket.baseUrl! })?.hostKind).toBe('generic');
  });
});

describe('projectRemote', () => {
  it('picks the first remote with a host and path (origin comes first)', () => {
    expect(
      projectRemote([
        { name: 'local', host: null, path: null, hostKind: 'generic' },
        { name: 'up', host: 'github.com', path: 'o/r', hostKind: 'github' },
      ]),
    ).toEqual({ host: 'github.com', path: 'o/r', hostKind: 'github' });
    expect(projectRemote([])).toBeNull();
  });
});

describe('host-type overrides (Settings > Hosts)', () => {
  it('effectiveKind prefers the override for the host, case-insensitively, else the detected kind', () => {
    expect(effectiveKind('code.example.com', 'generic', { 'code.example.com': 'gitlab' })).toBe('gitlab');
    expect(effectiveKind('Code.Example.com', 'generic', { 'code.example.com': 'github' })).toBe('github');
    expect(effectiveKind('code.example.com', 'generic', {})).toBe('generic');
    expect(effectiveKind('gitlab.example.com', 'gitlab', { 'other.example.com': 'github' })).toBe('gitlab');
    expect(effectiveKind(null, 'github', { x: 'gitlab' })).toBe('github');
  });
  it('projectRemote applies them, so a generic remote gets forge links', () => {
    const remotes = [{ name: 'origin', host: 'code.example.com', path: 'acme/shop', hostKind: 'generic' as const }];
    expect(projectRemote(remotes)?.hostKind).toBe('generic');
    const r = projectRemote(remotes, { 'code.example.com': 'gitlab' })!;
    expect(r.hostKind).toBe('gitlab');
    expect(commitUrl(r, 'abc')).toBe('https://code.example.com/acme/shop/-/commit/abc');
  });
});

describe('fileUrl', () => {
  it('builds the GitLab blob URL, with a range or single-line anchor', () => {
    expect(fileUrl(gitlab, 'main', 'src/lib.rs')).toBe('https://gitlab.example.com/group/project/-/blob/main/src/lib.rs');
    expect(fileUrl(gitlab, 'main', 'src/lib.rs', { a: 3, b: 3 })).toBe(
      'https://gitlab.example.com/group/project/-/blob/main/src/lib.rs#L3',
    );
    expect(fileUrl(gitlab, 'main', 'src/lib.rs', { a: 3, b: 8 })).toBe(
      'https://gitlab.example.com/group/project/-/blob/main/src/lib.rs#L3-8',
    );
  });

  it('builds the GitHub blob URL, using r.host (Enterprise-friendly), with GitHub-style anchors', () => {
    expect(fileUrl(github, 'main', 'src/lib.rs')).toBe('https://github.example.com/owner/repo/blob/main/src/lib.rs');
    expect(fileUrl(github, 'main', 'src/lib.rs', { a: 3, b: 3 })).toBe(
      'https://github.example.com/owner/repo/blob/main/src/lib.rs#L3',
    );
    expect(fileUrl(github, 'main', 'src/lib.rs', { a: 3, b: 8 })).toBe(
      'https://github.example.com/owner/repo/blob/main/src/lib.rs#L3-L8',
    );
  });

  it("builds Forgejo's src URL, by branch or by commit, with GitHub-style anchors", () => {
    const sha = 'a'.repeat(40);
    expect(fileUrl(forgejo, 'feat/x#1', 'src/lib.rs')).toBe('https://forgejo.example.org/owner/repo/src/branch/feat/x%231/src/lib.rs');
    expect(fileUrl(forgejo, sha, 'src/lib.rs', { a: 3, b: 8 })).toBe(`https://forgejo.example.org/owner/repo/src/commit/${sha}/src/lib.rs#L3-L8`);
    expect(fileUrl(forgejo, 'main', 'src/lib.rs', { a: 3, b: 3 })).toBe('https://forgejo.example.org/owner/repo/src/branch/main/src/lib.rs#L3');
  });

  it('returns null for generic hosts', () => {
    expect(fileUrl(generic, 'main', 'src/lib.rs')).toBeNull();
  });

  it('encodes each path segment, keeping / as a separator, and handles spaces and #', () => {
    expect(fileUrl(gitlab, 'main', 'a dir/my file#1.txt')).toBe(
      'https://gitlab.example.com/group/project/-/blob/main/a%20dir/my%20file%231.txt',
    );
  });

  it('encodes a branch-like ref containing / and #, without breaking the URL', () => {
    expect(fileUrl(gitlab, 'feat/x#1', 'lib.rs')).toBe('https://gitlab.example.com/group/project/-/blob/feat/x%231/lib.rs');
  });
});

describe('branchUrl', () => {
  it('builds GitLab and GitHub tree URLs', () => {
    expect(branchUrl(gitlab, 'main')).toBe('https://gitlab.example.com/group/project/-/tree/main');
    expect(branchUrl(github, 'main')).toBe('https://github.example.com/owner/repo/tree/main');
    expect(branchUrl(forgejo, 'feat/x#1')).toBe('https://forgejo.example.org/owner/repo/src/branch/feat/x%231');
  });

  it('returns null for generic hosts', () => {
    expect(branchUrl(generic, 'main')).toBeNull();
  });

  it('encodes a branch with / and #, without breaking the URL', () => {
    expect(branchUrl(gitlab, 'feat/x#1')).toBe('https://gitlab.example.com/group/project/-/tree/feat/x%231');
    expect(branchUrl(github, 'feat/x#1')).toBe('https://github.example.com/owner/repo/tree/feat/x%231');
  });
});

describe('commitUrl', () => {
  it('builds GitLab and GitHub commit URLs', () => {
    expect(commitUrl(gitlab, 'abc123')).toBe('https://gitlab.example.com/group/project/-/commit/abc123');
    expect(commitUrl(github, 'abc123')).toBe('https://github.example.com/owner/repo/commit/abc123');
    expect(commitUrl(forgejo, 'abc123')).toBe('https://forgejo.example.org/owner/repo/commit/abc123');
  });

  it('returns null for generic hosts', () => {
    expect(commitUrl(generic, 'abc123')).toBeNull();
  });
});

describe('mergeRequestUrl', () => {
  it('builds GitLab MR and GitHub PR URLs', () => {
    expect(mergeRequestUrl(gitlab, null, 42)).toBe('https://gitlab.example.com/group/project/-/merge_requests/42');
    expect(mergeRequestUrl(github, null, 42)).toBe('https://github.example.com/owner/repo/pull/42');
    expect(mergeRequestUrl(forgejo, null, 42)).toBe('https://forgejo.example.org/owner/repo/pulls/42');
    expect(mergeRequestUrl(forgejo, 'other/repo', 6)).toBe('https://forgejo.example.org/other/repo/pulls/6');
  });

  it('returns null for generic hosts', () => {
    expect(mergeRequestUrl(generic, null, 42)).toBeNull();
  });

  it('lets a project override replace r.path', () => {
    expect(mergeRequestUrl(gitlab, 'group/sub/project', 7)).toBe(
      'https://gitlab.example.com/group/sub/project/-/merge_requests/7',
    );
    expect(mergeRequestUrl(github, 'other/repo', 6)).toBe('https://github.example.com/other/repo/pull/6');
  });
});

describe('issueUrl', () => {
  it('builds GitLab and GitHub issue URLs', () => {
    expect(issueUrl(gitlab, null, 12)).toBe('https://gitlab.example.com/group/project/-/issues/12');
    expect(issueUrl(github, null, 12)).toBe('https://github.example.com/owner/repo/issues/12');
    expect(issueUrl(forgejo, null, 12)).toBe('https://forgejo.example.org/owner/repo/issues/12');
  });

  it('returns null for generic hosts', () => {
    expect(issueUrl(generic, null, 12)).toBeNull();
  });

  it('lets a project override replace r.path', () => {
    expect(issueUrl(gitlab, 'other/project', 3)).toBe('https://gitlab.example.com/other/project/-/issues/3');
  });
});
