/**
 * Builder body: prompt → V1 agent generates workspace files → files list →
 * edit/save → live preview built from the current workspace files.
 * Uses only the existing chat API and workspace API (no duplicate systems).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendChatMessage, V1ApiError } from '@/lib/v1/client';
import type { WorkspaceFileSummary } from '@/lib/v1/types';

const GENERATE_PREFIX = [
  'Build this as a small static website inside the V1 workspace.',
  'Use the file_write skill to save the files: site/index.html, site/styles.css and site/script.js (script optional).',
  'index.html must link "styles.css" and "script.js" with relative paths.',
  'If those files already exist, read them first and update them instead of starting over.',
  'After saving, reply with a short summary of what you built.',
  'Request:',
].join(' ');

async function readFile(path: string): Promise<string> {
  const res = await fetch(`/api/v1/workspace?path=${encodeURIComponent(path)}`);
  const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not open that file.');
  return data.content ?? '';
}

function buildPreview(files: Record<string, string>): string | null {
  const html = files['site/index.html'];
  if (!html) return null;
  const css = files['site/styles.css'] ?? '';
  const js = files['site/script.js'] ?? '';
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  return html
    .replace(/<link[^>]*href=["']\.?\/?styles\.css["'][^>]*>/i, `<style>${css}</style>`)
    .replace(
      /<script[^>]*src=["']\.?\/?script\.js["'][^>]*><\/script>/i,
      `<script>${safeJs}</script>`,
    );
}

export function BuilderPanel({
  tool,
  maxWidth,
  filesOpen,
}: {
  tool: string;
  maxWidth: string;
  filesOpen: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [files, setFiles] = useState<WorkspaceFileSummary[]>([]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/workspace');
      if (!res.ok) throw new Error('Could not load workspace files.');
      const list = (await res.json()) as WorkspaceFileSummary[];
      setFiles(list);
      const site = list.filter((f) => f.path.startsWith('site/'));
      const entries = await Promise.all(
        site.map(async (f) => [f.path, await readFile(f.path)] as const),
      );
      setContents(Object.fromEntries(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load workspace files.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await sendChatMessage({
        message: `${GENERATE_PREFIX} ${text}`.slice(0, 8000),
        mode: 'programming',
        conversationId: 'v1-builder',
      });
      const wrote = (res.steps ?? []).filter(
        (s) => s.toolId === 'file_write' && s.status === 'completed',
      );
      if (!wrote.length) setError('V1 did not save any files. Try a more specific prompt.');
      setSummary(res.message);
      await refresh();
    } catch (e) {
      setError(
        e instanceof V1ApiError || e instanceof Error ? e.message : 'Generation failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  const open = async (path: string) => {
    setError(null);
    try {
      const content = await readFile(path);
      setOpenPath(path);
      setDraft(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const save = async () => {
    if (!openPath) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: openPath, content: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save the file.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the file.');
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => buildPreview(contents), [contents]);
  const box = { borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' };
  const showEditor = tool === 'Edit' || openPath !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      {(tool === 'Prompt' || tool === 'Generate') && (
        <div className="rounded-xl border p-3" style={box}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the app or website you want to build…"
            rows={3}
            className="w-full resize-none rounded-lg border bg-transparent p-2 text-sm outline-none"
            style={{ borderColor: 'var(--ws-line)' }}
            data-testid="input-builder-prompt"
          />
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="mt-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--ws-accent)', background: 'var(--ws-raised)' }}
            data-testid="button-builder-generate"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {summary ? (
            <p className="mt-2 whitespace-pre-wrap text-xs" style={{ color: 'var(--ws-muted)' }}>
              {summary}
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--ws-danger)', color: 'var(--ws-danger)' }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {(filesOpen || tool === 'Edit') && (
        <div className="rounded-xl border p-3" style={box} data-testid="panel-files">
          <h3 className="mb-2 text-sm font-medium">Project Files</h3>
          {files.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>
              No files yet. Use Prompt → Generate.
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => open(f.path)}
                    className="w-full rounded px-2 py-1 text-left"
                    style={{
                      color: openPath === f.path ? 'var(--ws-accent)' : 'var(--ws-muted)',
                    }}
                  >
                    📄 {f.path} <span className="text-xs">({f.bytes} B)</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showEditor && openPath ? (
        <div className="rounded-xl border p-3" style={box}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="truncate">{openPath}</span>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg border px-2.5 py-1 disabled:opacity-50"
                style={{ borderColor: 'var(--ws-accent)' }}
                data-testid="button-builder-save"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setOpenPath(null)}
                className="rounded-lg border px-2.5 py-1"
                style={{ borderColor: 'var(--ws-line)' }}
              >
                Close
              </button>
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={14}
            className="w-full rounded-lg border bg-transparent p-2 font-mono text-xs outline-none"
            style={{ borderColor: 'var(--ws-line)' }}
            data-testid="input-builder-editor"
          />
        </div>
      ) : null}

      <div
        className="flex min-h-[320px] flex-1 justify-center rounded-xl border p-3"
        style={box}
      >
        {preview ? (
          <iframe
            title="Workspace preview"
            srcDoc={preview}
            sandbox="allow-scripts"
            className="h-full min-h-[300px] w-full rounded-lg bg-background"
            style={{ maxWidth }}
            data-testid="frame-builder-preview"
          />
        ) : (
          <p className="self-center text-sm" style={{ color: 'var(--ws-muted)' }}>
            No preview yet — generate a site to create site/index.html.
          </p>
        )}
      </div>
    </div>
  );
}
