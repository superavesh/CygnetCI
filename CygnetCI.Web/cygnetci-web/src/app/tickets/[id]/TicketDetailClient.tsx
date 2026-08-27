'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import PlaceholderExt from '@tiptap/extension-placeholder';
import { CONFIG } from '@/lib/config';
import {
  ArrowLeft, MessageSquare, Clock, Paperclip, Plus, X, Check,
  Edit2, Trash2, Download, Send, Sparkles, Bold, Italic, Code,
  List, ListOrdered, Heading2, Underline, Link as LinkIcon,
  Loader2, Upload, AlertCircle, CheckCircle,
  XCircle, User, MoreHorizontal, ChevronRight, ChevronDown, Reply,
  Building2, GitBranch, Rocket, Server, FileText, Image as ImageIcon,
} from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface Ticket {
  id: number; ticket_number: string; title: string; description: string | null;
  status: string; priority: string; type: string;
  created_by_id: number | null; created_by_name: string | null;
  assigned_to_id: number | null; assigned_to_name: string | null;
  customer_id: number | null; customer_name: string | null;
  pipeline_id: number | null; pipeline_name: string | null;
  release_id: number | null; release_name: string | null;
  agent_id: number | null; agent_name: string | null;
  root_cause: string | null; resolution_steps: string[];
  resolution_commands: string | null;
  resolved_by_id: number | null; resolved_by_name: string | null;
  resolved_at: string | null; created_at: string; updated_at: string;
}
interface Comment {
  id: number; ticket_id: number; body: string;
  created_by_id: number | null; created_by_name: string | null;
  edited_at: string | null; created_at: string; updated_at: string;
}
interface HistoryItem {
  id: number; ticket_id: number;
  changed_by_id: number | null; changed_by_name: string | null;
  field_name: string; old_value: string | null; new_value: string | null;
  created_at: string;
}
interface Approval {
  id: number; ticket_id: number;
  requested_by_id: number | null; requested_by_name: string | null;
  reviewed_by_id: number | null; reviewed_by_name: string | null;
  status: string; note: string | null;
  created_at: string; reviewed_at: string | null;
}
interface Attachment {
  id: number; ticket_id: number; original_filename: string;
  file_size: number | null; mime_type: string | null;
  uploaded_by_id: number | null; uploaded_by_name: string | null;
  created_at: string;
}
interface AppUser { id: number; username: string; full_name: string | null; }
interface ChatMsg { role: 'user' | 'assistant'; content: string; }

// ─── helpers ─────────────────────────────────────────────────────────────────

const API = () => CONFIG.api.baseUrl;

const sanitize = (html: string): string => {
  if (typeof window === 'undefined') return html;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require('dompurify');
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
};

const fmt = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function av(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const TYPE_ICON_BG: Record<string, string> = {
  bug: 'bg-red-500', task: 'bg-blue-500', improvement: 'bg-purple-500', question: 'bg-teal-500',
};

// ─── Status button with dropdown ─────────────────────────────────────────────

function StatusButton({ status, onChange }: { status: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const styles: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200',
    in_progress: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200',
    resolved: 'bg-green-600 text-white border-green-700 hover:bg-green-700',
    closed: 'bg-gray-600 text-white border-gray-700 hover:bg-gray-700',
  };
  const labels: Record<string, string> = {
    open: 'OPEN', in_progress: 'IN PROGRESS', resolved: 'RESOLVED', closed: 'CLOSED',
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold tracking-wide border transition-colors ${styles[status] ?? styles.open}`}
      >
        {labels[status] ?? status.toUpperCase()}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[150px]">
          {Object.entries(labels).map(([v, l]) => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                v === status ? 'text-blue-600 font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tiptap Toolbar ──────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={`p-1.5 rounded text-gray-600 hover:bg-gray-100 ${active ? 'bg-gray-200 text-gray-900' : ''}`}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={13} />, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={13} />, 'Italic')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <Underline size={13} />, 'Underline')}
      {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <Code size={13} />, 'Code')}
      <span className="w-px h-4 bg-gray-300 mx-1 self-center" />
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={13} />, 'H2')}
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List size={13} />, 'Bullet list')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={13} />, 'Ordered list')}
      <span className="w-px h-4 bg-gray-300 mx-1 self-center" />
      {btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <Code size={13} />, 'Code block')}
      {btn(editor.isActive('link'), () => {
        const url = window.prompt('URL', editor.getAttributes('link').href ?? '');
        if (url === null) return;
        if (url === '') { editor.chain().focus().unsetLink().run(); return; }
        editor.chain().focus().setLink({ href: url }).run();
      }, <LinkIcon size={13} />, 'Link')}
    </div>
  );
}

// ─── Sidebar collapsible section ─────────────────────────────────────────────

function SidebarSection({ title, children, defaultOpen = true }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full text-left py-3 px-1 group"
      >
        <ChevronRight
          size={14}
          className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-semibold text-gray-700">{title}</span>
      </button>
      {open && <div className="pb-3 px-1">{children}</div>}
    </div>
  );
}

// ─── Sidebar field (Jira-style label + value) ─────────────────────────────────

function SidebarField({
  label, value, options, onSave, renderValue, extraNode,
}: {
  label: string;
  value: string | null;
  options?: { value: string; label: string }[];
  onSave?: (val: string | null) => void;
  renderValue?: (val: string | null) => React.ReactNode;
  extraNode?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const displayValue = renderValue ? renderValue(value) : (
    value
      ? <span className="text-sm text-gray-800">{value}</span>
      : <span className="text-sm text-gray-400">None</span>
  );

  return (
    <div className="flex gap-2 py-2 items-start min-h-[36px]">
      <div className="w-28 flex-shrink-0 text-xs text-gray-500 pt-0.5 leading-4">{label}</div>
      <div className="flex-1 min-w-0">
        {onSave && editing ? (
          options ? (
            <select
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { onSave(draft || null); setEditing(false); }}
              className="w-full text-sm border border-blue-400 rounded px-2 py-0.5 text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">— none —</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { onSave(draft || null); setEditing(false); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { onSave(draft || null); setEditing(false); }
                if (e.key === 'Escape') setEditing(false);
              }}
              className="w-full text-sm border border-blue-400 rounded px-2 py-0.5 text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )
        ) : (
          <div
            onClick={onSave ? () => setEditing(true) : undefined}
            className={`text-sm leading-5 ${onSave ? 'cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 py-0.5 transition-colors' : ''}`}
          >
            {displayValue}
            {extraNode}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────

export default function TicketDetailClient({ ticketId, onBack }: { ticketId: string; onBack?: () => void }) {
  // The ticket id. On a direct deep-link (e.g. /tickets/76/) the static export serves the
  // pre-built shell whose baked param is "0", so derive the real id from the URL on the client.
  const [id, setId] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const m = window.location.pathname.match(/\/tickets\/(\d+)/);
      if (m) { const u = parseInt(m[1], 10); if (!Number.isNaN(u)) return u; }
    }
    return parseInt(ticketId, 10);
  });
  // Keep in sync when navigated in-app (prop changes to a real, non-shell id).
  useEffect(() => {
    const p = parseInt(ticketId, 10);
    if (!Number.isNaN(p) && p !== 0 && p !== id) setId(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Failures in the secondary panels (comments/history/approvals/attachments/users) are
  // shown as a small retry banner instead of failing the whole ticket view — see loadAll().
  const [secondaryError, setSecondaryError] = useState<string | null>(null);

  // Current logged-in user (from localStorage) — used to attribute comments, edits,
  // approvals and field changes instead of sending a null author (which renders as "?").
  const [currentUser, setCurrentUser] = useState<{ id: number; full_name?: string | null; username?: string } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch { /* ignore malformed user */ }
  }, []);
  const currentUserId = currentUser?.id ?? null;
  const currentUserName = currentUser?.full_name || currentUser?.username || null;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentFocused, setCommentFocused] = useState(false);
  const [copiedCommentId, setCopiedCommentId] = useState<number | null>(null);
  const [highlightCommentId, setHighlightCommentId] = useState<number | null>(null);
  const commentBoxRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'approvals'>('comments');

  // AI chat
  const [showAI, setShowAI] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [uploading, setUploading] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [approvalNote, setApprovalNote] = useState('');

  // ── Tiptap editors ─────────────────────────────────────────────────────────

  // StarterKit (v3) already bundles Link and Underline — configure them here instead of
  // adding separate extension instances, which used to register 'link'/'underline' twice.
  const descEditor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      PlaceholderExt.configure({ placeholder: 'Add a description…' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700 min-h-[80px]' } },
  });

  const commentEditor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      PlaceholderExt.configure({ placeholder: 'Add a comment…' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700 min-h-[80px]' } },
  });

  const editCommentEditor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700 min-h-[60px]' } },
  });

  // ── Data loading ───────────────────────────────────────────────────────────

  // The core ticket fetch is fatal on failure (there's nothing to render without it) and
  // is kept separate from the secondary panels below, which load independently so a single
  // endpoint's hiccup (e.g. a transient 502) can't take down the whole ticket view.
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSecondaryError(null);
    const base = API();

    let t: Ticket;
    try {
      const res = await fetch(`${base}/tickets/${id}`);
      if (!res.ok) throw new Error('Ticket not found');
      t = await res.json();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket');
      setLoading(false);
      return;
    }
    setTicket(t);
    setTitleDraft(t.title);
    if (descEditor && t.description) {
      descEditor.commands.setContent(t.description);
    }
    setLoading(false);

    const fetchJson = async (path: string) => {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) throw new Error(`${path} -> ${res.status}`);
      return res.json();
    };

    const [cRes, hRes, apRes, attRes, uRes] = await Promise.allSettled([
      fetchJson(`/tickets/${id}/comments`),
      fetchJson(`/tickets/${id}/history`),
      fetchJson(`/tickets/${id}/approvals`),
      fetchJson(`/tickets/${id}/attachments`),
      fetchJson('/users'),
    ]);

    if (cRes.status === 'fulfilled') setComments(cRes.value); else console.error('Failed to load comments:', cRes.reason);
    if (hRes.status === 'fulfilled') setHistory(hRes.value); else console.error('Failed to load history:', hRes.reason);
    if (apRes.status === 'fulfilled') setApprovals(apRes.value); else console.error('Failed to load approvals:', apRes.reason);
    if (attRes.status === 'fulfilled') setAttachments(attRes.value); else console.error('Failed to load attachments:', attRes.reason);
    if (uRes.status === 'fulfilled') setUsers(Array.isArray(uRes.value) ? uRes.value : []); else console.error('Failed to load users:', uRes.reason);

    const failed = [cRes, hRes, apRes, attRes, uRes].filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      setSecondaryError(`Failed to load ${failed} section${failed > 1 ? 's' : ''} of this ticket.`);
    }
  }, [id, descEditor]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Patch ticket ────────────────────────────────────────────────────────────

  const patchTicket = async (fields: Record<string, unknown>) => {
    if (!ticket) return;
    const res = await fetch(`${API()}/tickets/${id}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, changed_by: currentUserId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTicket(updated);
      const hist = await fetch(`${API()}/tickets/${id}/history`).then(r => r.json());
      setHistory(hist);
    }
  };

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === ticket?.title) { setEditingTitle(false); return; }
    await patchTicket({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const saveDescription = async () => {
    if (!descEditor) return;
    await patchTicket({ description: descEditor.getHTML() });
    setEditingDesc(false);
  };

  const cancelDescription = () => {
    if (descEditor && ticket?.description) descEditor.commands.setContent(ticket.description);
    setEditingDesc(false);
  };

  // ── Comments ────────────────────────────────────────────────────────────────

  const submitComment = async () => {
    if (!commentEditor) return;
    const body = commentEditor.getHTML();
    if (!body || body === '<p></p>') return;
    await fetch(`${API()}/tickets/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, created_by: currentUserId }),
    });
    commentEditor.commands.clearContent();
    setCommentFocused(false);
    const [c, h] = await Promise.all([
      fetch(`${API()}/tickets/${id}/comments`).then(r => r.json()),
      fetch(`${API()}/tickets/${id}/history`).then(r => r.json()),
    ]);
    setComments(c);
    setHistory(h);
  };

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id);
    if (editCommentEditor) editCommentEditor.commands.setContent(c.body);
  };

  const saveEditComment = async (commentId: number) => {
    if (!editCommentEditor) return;
    await fetch(`${API()}/ticket-comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editCommentEditor.getHTML(), updated_by: currentUserId }),
    });
    setEditingCommentId(null);
    const c = await fetch(`${API()}/tickets/${id}/comments`).then(r => r.json());
    setComments(c);
  };

  const deleteComment = async (commentId: number) => {
    if (!confirm('Delete this comment?')) return;
    await fetch(`${API()}/ticket-comments/${commentId}`, { method: 'DELETE' });
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  // Reply: open the comment editor pre-filled with a quote of the original.
  const replyToComment = (c: Comment) => {
    if (!commentEditor) return;
    const who = (c.created_by_name || 'Unknown').replace(/</g, '&lt;');
    setActiveTab('comments');
    setCommentFocused(true);
    commentEditor.commands.setContent(
      `<blockquote><p><strong>${who}</strong> wrote:</p>${c.body}</blockquote><p></p>`
    );
    commentEditor.commands.focus('end');
    setTimeout(() => commentBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  // Copy a permalink to a specific comment.
  const copyCommentLink = async (commentId: number) => {
    const url = `${window.location.origin}/tickets/${id}/#comment-${commentId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopiedCommentId(commentId);
    setTimeout(() => setCopiedCommentId(prev => (prev === commentId ? null : prev)), 1500);
  };

  // On load (and when comments arrive), scroll to and highlight a linked comment (#comment-N).
  useEffect(() => {
    if (typeof window === 'undefined' || comments.length === 0) return;
    const hash = window.location.hash;
    const m = hash.match(/^#comment-(\d+)$/);
    if (!m) return;
    const cid = parseInt(m[1], 10);
    const el = document.getElementById(`comment-${cid}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightCommentId(cid);
      setTimeout(() => setHighlightCommentId(prev => (prev === cid ? null : prev)), 2500);
    }
  }, [comments]);

  // ── Approvals ───────────────────────────────────────────────────────────────

  const requestApproval = async () => {
    await fetch(`${API()}/tickets/${id}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_by: currentUserId }),
    });
    const [ap, h] = await Promise.all([
      fetch(`${API()}/tickets/${id}/approvals`).then(r => r.json()),
      fetch(`${API()}/tickets/${id}/history`).then(r => r.json()),
    ]);
    setApprovals(ap);
    setHistory(h);
  };

  const reviewApproval = async (approvalId: number, status: 'approved' | 'rejected') => {
    await fetch(`${API()}/ticket-approvals/${approvalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note: approvalNote || null, reviewed_by: currentUserId }),
    });
    setApprovalNote('');
    const [ap, h] = await Promise.all([
      fetch(`${API()}/tickets/${id}/approvals`).then(r => r.json()),
      fetch(`${API()}/tickets/${id}/history`).then(r => r.json()),
    ]);
    setApprovals(ap);
    setHistory(h);
  };

  // ── Attachments ─────────────────────────────────────────────────────────────

  const uploadAttachment = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`${API()}/tickets/${id}/attachments`, { method: 'POST', body: fd });
    const att = await fetch(`${API()}/tickets/${id}/attachments`).then(r => r.json());
    setAttachments(att);
    setUploading(false);
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!confirm('Delete this attachment?')) return;
    await fetch(`${API()}/ticket-attachments/${attachmentId}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== attachmentId));
  };

  // ── AI chat ──────────────────────────────────────────────────────────────────

  const sendAIMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const newMsgs: ChatMsg[] = [...chatMsgs, { role: 'user', content: text }];
    setChatMsgs(newMsgs);
    setChatInput('');
    setChatLoading(true);
    const assistantIdx = newMsgs.length;
    setChatMsgs(m => [...m, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`${API()}/tickets/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          ticket_id: id,
          customer_id: ticket?.customer_id ?? null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'AI error' }));
        setChatMsgs(m => m.map((msg, i) => i === assistantIdx ? { ...msg, content: `Error: ${err.detail}` } : msg));
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const event = JSON.parse(data);
            if (event.text) {
              setChatMsgs(m => m.map((msg, i) => i === assistantIdx ? { ...msg, content: msg.content + event.text } : msg));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e: unknown) {
      setChatMsgs(m => m.map((msg, i) => i === assistantIdx ? { ...msg, content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` } : msg));
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs]);

  // ── User options ────────────────────────────────────────────────────────────

  const userOptions = users.map(u => ({ value: String(u.id), label: u.full_name || u.username }));

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">{error || 'Ticket not found'}</p>
          <button onClick={() => onBack ? onBack() : window.history.back()} className="mt-4 text-sm text-blue-600 hover:underline">
            ← Back to tickets
          </button>
        </div>
      </div>
    );
  }

  const pendingApproval = approvals.find(a => a.status === 'pending');
  const typeIconBg = TYPE_ICON_BG[ticket.type] ?? 'bg-blue-500';

  return (
    <div className="min-h-screen bg-white">

      {/* ── Sticky breadcrumb bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-2.5 sticky top-0 z-20 flex items-center gap-2">
        <button
          onClick={() => onBack ? onBack() : window.history.back()}
          className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft size={14} />
          Tickets
        </button>
        <ChevronRight size={13} className="text-gray-300" />
        <span className="text-sm text-gray-400 font-mono">{ticket.ticket_number}</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAI(s => !s)}
          className={`group flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
            showAI
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 ring-1 ring-blue-200 shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-300 hover:shadow-sm'
          }`}
        >
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm group-hover:scale-105 transition-transform">
            <Sparkles size={14} className="text-white" />
          </span>
          Ask Cygie
        </button>
      </div>

      {secondaryError && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-sm text-amber-800">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span className="flex-1">{secondaryError}</span>
          <button onClick={() => loadAll()} className="font-medium text-amber-900 hover:underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      <div className="max-w-full px-6 pt-6 pb-12 flex gap-8 items-start">

        {/* ── Left: main content ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Type badge + ticket number */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-sm ${typeIconBg} flex-shrink-0`}>
              <span className="text-white text-[9px] font-bold uppercase">{ticket.type.charAt(0)}</span>
            </span>
            <span className="text-sm text-gray-400 font-mono">{ticket.ticket_number}</span>
          </div>

          {/* Title */}
          <div className="mb-6">
            {editingTitle ? (
              <div className="flex items-start gap-2">
                <input
                  autoFocus
                  type="text"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(ticket.title); }
                  }}
                  className="flex-1 text-2xl font-bold text-gray-900 border-b-2 border-blue-400 bg-transparent focus:outline-none py-0.5"
                />
                <button onClick={saveTitle} className="text-green-600 hover:text-green-700 mt-1.5"><Check size={18} /></button>
                <button onClick={() => { setEditingTitle(false); setTitleDraft(ticket.title); }} className="text-gray-400 hover:text-gray-600 mt-1.5"><X size={18} /></button>
              </div>
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-gray-700 transition-colors leading-tight"
                onClick={() => setEditingTitle(true)}
              >
                {ticket.title}
              </h1>
            )}
          </div>

          {/* Description */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
            {editingDesc ? (
              <div className="border border-gray-300 rounded-md overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
                <Toolbar editor={descEditor} />
                <EditorContent editor={descEditor} />
                <div className="flex gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50">
                  <button onClick={saveDescription} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Save</button>
                  <button onClick={cancelDescription} className="px-3 py-1.5 rounded text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className="tiptap-content text-sm text-gray-700 min-h-[40px] cursor-text hover:bg-gray-50 rounded px-2 py-1.5 -mx-2 transition-colors"
                onClick={() => setEditingDesc(true)}
                dangerouslySetInnerHTML={{
                  __html: sanitize(ticket.description || '<p style="color:#9ca3af">Click to add a description…</p>'),
                }}
              />
            )}
          </div>

          {/* Attachments (inline, Jira-style) */}
          {attachments.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Paperclip size={14} className="text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700">Attachments</h3>
                <span className="text-xs text-gray-400">{attachments.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {attachments.map(a => {
                  const isImg = a.mime_type?.startsWith('image/');
                  return (
                    <div key={a.id} className="flex items-center gap-2.5 p-2.5 border border-gray-200 rounded-lg bg-gray-50 group hover:border-gray-300 transition-colors">
                      {isImg
                        ? <ImageIcon size={16} className="text-blue-400 flex-shrink-0" />
                        : <FileText size={16} className="text-gray-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 font-medium truncate">{a.original_filename}</p>
                        <p className="text-xs text-gray-400">{fmtSize(a.file_size)}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={`${API()}/ticket-attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                          className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors">
                          <Download size={12} />
                        </a>
                        <button onClick={() => deleteAttachment(a.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Activity */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Activity</h3>

            {/* Tabs */}
            <div className="flex items-center border-b border-gray-200 mb-5 -mx-0.5">
              {([
                { key: 'comments', label: 'Comments', count: comments.length },
                { key: 'history',  label: 'History',  count: history.length },
                { key: 'approvals', label: 'Approvals', count: approvals.length },
              ] as const).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === key
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`ml-1.5 text-xs ${activeTab === key ? 'text-blue-500' : 'text-gray-400'}`}>{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Comments tab */}
            {activeTab === 'comments' && (
              <div>
                {/* Jira-style comment input */}
                <div ref={commentBoxRef} className="flex gap-3 items-start mb-6">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 uppercase">
                    {av(currentUserName)}
                  </div>
                  <div className="flex-1">
                    {commentFocused ? (
                      <div className="border border-gray-300 rounded-md overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-200">
                        <Toolbar editor={commentEditor} />
                        <EditorContent editor={commentEditor} />
                        <div className="flex gap-2 px-3 py-2 bg-gray-50 border-t border-gray-100">
                          <button onClick={submitComment} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                            <Send size={12} /> Save
                          </button>
                          <button onClick={() => { commentEditor?.commands.clearContent(); setCommentFocused(false); }}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => setCommentFocused(true)}
                        className="px-3 py-2.5 border border-gray-200 rounded-md text-sm text-gray-400 cursor-text hover:bg-gray-50 hover:border-gray-300 transition-colors bg-white select-none"
                      >
                        Add a comment…
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments list */}
                {comments.length === 0 && !commentFocused && (
                  <p className="text-sm text-gray-400 italic pl-11">No comments yet. Be the first to comment.</p>
                )}
                <div className="space-y-5">
                  {[...comments]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map(c => (
                    <div
                      key={c.id}
                      id={`comment-${c.id}`}
                      className={`flex gap-3 group scroll-mt-20 rounded-lg transition-colors ${
                        highlightCommentId === c.id ? 'ring-2 ring-blue-300 bg-blue-50/50 -m-1 p-1' : ''
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 uppercase">
                        {av(c.created_by_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-800">{c.created_by_name || 'Unknown'}</span>
                          <span className="text-xs text-gray-400">{fmt(c.created_at)}</span>
                          {c.edited_at && <span className="text-xs text-gray-400 italic">· edited</span>}
                          <div className="flex-1" />
                          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                            <button onClick={() => replyToComment(c)} title="Reply" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
                              <Reply size={13} />
                            </button>
                            <button onClick={() => copyCommentLink(c.id)} title="Copy link" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
                              {copiedCommentId === c.id ? <Check size={13} className="text-green-600" /> : <LinkIcon size={13} />}
                            </button>
                            <button onClick={() => startEditComment(c)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => deleteComment(c.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {editingCommentId === c.id ? (
                          <div className="border border-gray-300 rounded-md overflow-hidden focus-within:border-blue-400">
                            <Toolbar editor={editCommentEditor} />
                            <EditorContent editor={editCommentEditor} />
                            <div className="flex gap-2 px-3 py-2 bg-gray-50 border-t border-gray-100">
                              <button onClick={() => saveEditComment(c.id)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Save</button>
                              <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="tiptap-content text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2.5 hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => startEditComment(c)}
                            dangerouslySetInnerHTML={{ __html: sanitize(c.body) }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History tab */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                {history.length === 0 && <p className="text-sm text-gray-400 italic">No history yet.</p>}
                {history.map(h => (
                  <div key={h.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-bold flex-shrink-0 uppercase">
                      {av(h.changed_by_name)}
                    </div>
                    <div className="flex-1 min-w-0 py-1">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-semibold text-gray-800">{h.changed_by_name || 'System'}</span>
                        <span className="text-gray-500">
                          {h.field_name === 'comment' ? 'added a comment' :
                           h.field_name === 'approval' ? `set approval to ${h.new_value}` :
                           `changed ${h.field_name.replace(/_/g, ' ')}`}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(h.created_at)}</span>
                      </div>
                      {h.field_name !== 'comment' && h.field_name !== 'approval' && (h.old_value || h.new_value) && (
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          {h.old_value && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded line-through">{h.old_value}</span>}
                          {h.old_value && h.new_value && <span className="text-gray-400">→</span>}
                          {h.new_value && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">{h.new_value}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approvals tab */}
            {activeTab === 'approvals' && (
              <div>
                {!pendingApproval && (
                  <button
                    onClick={requestApproval}
                    className="mb-4 flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors font-medium"
                  >
                    <Plus size={14} /> Request Approval
                  </button>
                )}
                {approvals.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No approvals requested yet.</p>
                )}
                <div className="space-y-3">
                  {approvals.map(a => (
                    <div key={a.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
                          a.status === 'approved' ? 'bg-green-100 text-green-700' :
                          a.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {a.status === 'approved' && <CheckCircle size={10} />}
                          {a.status === 'rejected' && <XCircle size={10} />}
                          {a.status === 'pending' && <Clock size={10} />}
                          {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                        </span>
                        <span className="text-xs text-gray-500">requested by {a.requested_by_name || 'Unknown'}</span>
                        <span className="text-xs text-gray-400">· {fmt(a.created_at)}</span>
                      </div>
                      {a.note && <p className="text-sm text-gray-600 italic mb-2">{a.note}</p>}
                      {a.status === 'pending' && (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            placeholder="Optional review note…"
                            value={approvalNote}
                            onChange={e => setApprovalNote(e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 text-gray-700 focus:outline-none focus:border-blue-400"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => reviewApproval(a.id, 'approved')}
                              className="flex-1 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 font-medium">
                              <CheckCircle size={13} /> Approve
                            </button>
                            <button onClick={() => reviewApproval(a.id, 'rejected')}
                              className="flex-1 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 font-medium">
                              <XCircle size={13} /> Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0">

          {/* Action row: status button + approval */}
          <div className="flex flex-wrap gap-2 mb-4">
            <StatusButton
              status={ticket.status}
              onChange={s => patchTicket({ status: s })}
            />
            {pendingApproval && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold tracking-wide bg-amber-100 text-amber-700 border border-amber-300">
                <Clock size={11} /> PENDING APPROVAL
              </span>
            )}
          </div>

          {/* Upload button */}
          <div className="mb-4">
            <button
              onClick={() => attachInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors border border-gray-200 rounded px-2.5 py-1.5 hover:border-blue-300 bg-white"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
              Attach file
            </button>
            <input ref={attachInputRef} type="file" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }} />
          </div>

          {/* Details section */}
          <SidebarSection title="Details">
            <SidebarField
              label="Assignee"
              value={ticket.assigned_to_id ? String(ticket.assigned_to_id) : null}
              options={userOptions}
              onSave={v => patchTicket({ assigned_to: v ? parseInt(v) : null })}
              renderValue={() => ticket.assigned_to_name ? (
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {av(ticket.assigned_to_name)}
                  </span>
                  <span className="text-sm text-gray-800">{ticket.assigned_to_name}</span>
                </div>
              ) : <span className="text-sm text-gray-400">None</span>}
            />
            <SidebarField
              label="Reporter"
              value={ticket.created_by_name}
              renderValue={v => v ? (
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {av(v)}
                  </span>
                  <span className="text-sm text-gray-800">{v}</span>
                </div>
              ) : <span className="text-sm text-gray-400">Unknown</span>}
            />
            <SidebarField
              label="Priority"
              value={ticket.priority}
              options={[
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
              onSave={v => v && patchTicket({ priority: v })}
              renderValue={v => {
                const dotColor: Record<string, string> = {
                  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-gray-300',
                };
                const textColor: Record<string, string> = {
                  critical: 'text-red-600', high: 'text-orange-500', medium: 'text-yellow-600', low: 'text-gray-500',
                };
                return v ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${dotColor[v] ?? 'bg-gray-300'}`} />
                    <span className={`text-sm ${textColor[v] ?? 'text-gray-600'}`}>{v.charAt(0).toUpperCase() + v.slice(1)}</span>
                  </div>
                ) : <span className="text-sm text-gray-400">None</span>;
              }}
            />
            <SidebarField
              label="Type"
              value={ticket.type}
              options={[
                { value: 'bug', label: 'Bug' },
                { value: 'task', label: 'Task' },
                { value: 'improvement', label: 'Improvement' },
                { value: 'question', label: 'Question' },
              ]}
              onSave={v => v && patchTicket({ type: v })}
              renderValue={v => {
                const bg = TYPE_ICON_BG[v ?? ''] ?? 'bg-blue-500';
                return v ? (
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm ${bg}`}>
                      <span className="text-white text-[8px] font-bold uppercase">{v.charAt(0)}</span>
                    </span>
                    <span className="text-sm text-gray-800 capitalize">{v}</span>
                  </div>
                ) : <span className="text-sm text-gray-400">None</span>;
              }}
            />
            <div className="flex gap-2 py-2 items-start">
              <div className="w-28 flex-shrink-0 text-xs text-gray-500 pt-0.5">Created</div>
              <div className="flex-1 text-sm text-gray-600">{fmt(ticket.created_at)}</div>
            </div>
            <div className="flex gap-2 py-2 items-start">
              <div className="w-28 flex-shrink-0 text-xs text-gray-500 pt-0.5">Updated</div>
              <div className="flex-1 text-sm text-gray-600">{fmt(ticket.updated_at)}</div>
            </div>
          </SidebarSection>

          {/* Links section */}
          <SidebarSection title="Links" defaultOpen={true}>
            <SidebarField
              label={<span className="flex items-center gap-1"><Building2 size={11} />Customer</span> as unknown as string}
              value={ticket.customer_name}
              renderValue={v => <span className="text-sm text-gray-700">{v || <span className="text-gray-400">None</span>}</span>}
            />
            <SidebarField
              label={<span className="flex items-center gap-1"><GitBranch size={11} />Pipeline</span> as unknown as string}
              value={ticket.pipeline_name}
              renderValue={v => <span className="text-sm text-gray-700">{v || <span className="text-gray-400">None</span>}</span>}
            />
            <SidebarField
              label={<span className="flex items-center gap-1"><Rocket size={11} />Release</span> as unknown as string}
              value={ticket.release_name}
              renderValue={v => <span className="text-sm text-gray-700">{v || <span className="text-gray-400">None</span>}</span>}
            />
            <SidebarField
              label={<span className="flex items-center gap-1"><Server size={11} />Agent</span> as unknown as string}
              value={ticket.agent_name}
              renderValue={v => <span className="text-sm text-gray-700">{v || <span className="text-gray-400">None</span>}</span>}
            />
          </SidebarSection>

          {/* Resolution section */}
          <SidebarSection title="Resolution" defaultOpen={false}>
            <SidebarField
              label="Root Cause"
              value={ticket.root_cause}
              onSave={v => patchTicket({ root_cause: v })}
            />
            <SidebarField
              label="Commands"
              value={ticket.resolution_commands}
              onSave={v => patchTicket({ resolution_commands: v })}
            />
            {ticket.resolved_at && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 mt-1.5 py-1">
                <CheckCircle size={12} /> Resolved {fmt(ticket.resolved_at)}
              </div>
            )}
            {ticket.resolved_by_name && (
              <div className="flex gap-2 py-2 items-start">
                <div className="w-28 flex-shrink-0 text-xs text-gray-500 pt-0.5">Resolved by</div>
                <div className="flex-1 text-sm text-gray-700">{ticket.resolved_by_name}</div>
              </div>
            )}
          </SidebarSection>

          {/* Attachments section */}
          {attachments.length > 0 && (
            <SidebarSection title={`Attachments (${attachments.length})`} defaultOpen={false}>
              <div className="space-y-1">
                {attachments.map(a => (
                  <div key={a.id} className="flex items-center gap-2 py-1 group">
                    <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">{a.original_filename}</p>
                    </div>
                    <a href={`${API()}/ticket-attachments/${a.id}/download`} target="_blank" rel="noreferrer"
                      className="p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all">
                      <Download size={11} />
                    </a>
                  </div>
                ))}
              </div>
            </SidebarSection>
          )}
        </div>
      </div>

      {/* ── Cygie AI Chat Panel ───────────────────────────────────────────────── */}
      {showAI && (
        <>
          {/* Backdrop — clicking outside the panel closes it */}
          <div className="fixed inset-0 z-30 bg-gray-900/10 backdrop-blur-[1px]" onClick={() => setShowAI(false)} />

          <div className="fixed right-4 top-4 bottom-4 w-[396px] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 flex flex-col z-40 overflow-hidden animate-slide-in">
            {/* Clean header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm">
                  <Sparkles size={18} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900 tracking-tight">Cygie</div>
                  <div className="text-[11px] text-gray-500">Ask about this ticket</div>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setChatMsgs([])} className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" title="Clear">
                  <MoreHorizontal size={15} />
                </button>
                <button onClick={() => setShowAI(false)} className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-lg transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-blue-50/40 to-white">
              {chatMsgs.length === 0 && (
                <div className="mt-2">
                  <div className="flex flex-col items-center text-center mb-5">
                    <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-3">
                      <Sparkles size={24} className="text-white" />
                    </div>
                    <p className="text-sm font-semibold text-gray-800">Hi, I&apos;m Cygie 👋</p>
                    <p className="text-xs text-gray-500 mt-1 px-4">Ask me anything about this ticket.</p>
                  </div>
                  <div className="space-y-2">
                    {['Summarize this ticket', 'What might be the root cause?', 'Suggest resolution steps'].map(s => (
                      <button key={s} onClick={() => setChatInput(s)}
                        className="group flex items-center gap-2.5 w-full text-left text-xs px-3 py-2.5 rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/60 hover:shadow-sm text-gray-600 hover:text-blue-700 transition-all">
                        <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-blue-50 text-blue-500 group-hover:bg-blue-100 transition-colors flex-shrink-0">
                          <Sparkles size={13} />
                        </span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMsgs.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'assistant' && (
                    <div className="flex items-center justify-center h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex-shrink-0 mt-0.5">
                      <Sparkles size={14} className="text-white" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.role === 'user' ? 'bg-blue-600 rounded-br-md' : 'bg-white border border-gray-200 rounded-bl-md'}`}>
                    {m.role === 'assistant' && !m.content && chatLoading
                      ? <Loader2 size={14} className="animate-spin text-blue-400" />
                      : <div className={`whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'text-white' : 'text-gray-700'}`}>{m.content}</div>}
                  </div>
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            <div className="p-3 border-t border-gray-100 bg-white">
              <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white focus-within:border-blue-500 transition-colors px-2 py-1.5">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); } }}
                  placeholder="Ask Cygie about this ticket…"
                  className="flex-1 text-sm bg-transparent px-1.5 py-1 text-gray-700 focus:outline-none focus:ring-0 border-0"
                />
                <button onClick={sendAIMessage} disabled={chatLoading || !chatInput.trim()}
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:shadow-md disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0">
                  <Send size={14} />
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5 text-center">Cygie can make mistakes · verify important actions</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
