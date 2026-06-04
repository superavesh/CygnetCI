'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import LinkExt from '@tiptap/extension-link';
import PlaceholderExt from '@tiptap/extension-placeholder';
import { CONFIG } from '@/lib/config';
import {
  ArrowLeft, MessageSquare, Clock, Paperclip, Plus, X, Check,
  Edit2, Trash2, Download, Send, Bot, Bold, Italic, Code,
  List, ListOrdered, Heading2, Underline, Link as LinkIcon,
  Loader2, Upload, AlertCircle, CheckCircle,
  XCircle, User, MoreHorizontal,
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

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-200 text-gray-600',
};
const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
};
const TYPE_STYLES: Record<string, string> = {
  bug: 'bg-red-50 text-red-600',
  task: 'bg-blue-50 text-blue-600',
  improvement: 'bg-purple-50 text-purple-600',
  question: 'bg-green-50 text-green-600',
};

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
    <div className="flex flex-wrap gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-md">
      {btn(editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold size={14} />, 'Bold')}
      {btn(editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic size={14} />, 'Italic')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <Underline size={14} />, 'Underline')}
      {btn(editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <Code size={14} />, 'Code')}
      <span className="w-px h-5 bg-gray-300 mx-1 self-center" />
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 size={14} />, 'Heading 2')}
      {btn(editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List size={14} />, 'Bullet list')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered size={14} />, 'Ordered list')}
      <span className="w-px h-5 bg-gray-300 mx-1 self-center" />
      {btn(editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <Code size={14} />, 'Code block')}
      {btn(editor.isActive('link'), () => {
        const url = window.prompt('URL', editor.getAttributes('link').href ?? '');
        if (url === null) return;
        if (url === '') { editor.chain().focus().unsetLink().run(); return; }
        editor.chain().focus().setLink({ href: url }).run();
      }, <LinkIcon size={14} />, 'Link')}
    </div>
  );
}

// ─── Sidebar Field ───────────────────────────────────────────────────────────

function SidebarField({
  label, value, options, onSave, renderValue,
}: {
  label: string;
  value: string | null;
  options?: { value: string; label: string }[];
  onSave?: (val: string | null) => void;
  renderValue?: (val: string | null) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  if (!onSave) {
    return (
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
        <div className="text-sm text-gray-700">{renderValue ? renderValue(value) : (value || <span className="text-gray-400">—</span>)}</div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
        {options ? (
          <select
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { onSave(draft || null); setEditing(false); }}
            className="w-full text-sm border border-blue-400 rounded px-2 py-1 text-gray-700 bg-white focus:outline-none"
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
            onKeyDown={e => { if (e.key === 'Enter') { onSave(draft || null); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
            className="w-full text-sm border border-blue-400 rounded px-2 py-1 text-gray-700 bg-white focus:outline-none"
          />
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 group cursor-pointer" onClick={() => setEditing(true)}>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-gray-700 flex items-center gap-1 hover:text-blue-600 transition-colors">
        {renderValue ? renderValue(value) : (value || <span className="text-gray-400">— click to edit —</span>)}
        <Edit2 size={10} className="opacity-0 group-hover:opacity-50 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  );
}

// ─── Main Client Component ───────────────────────────────────────────────────

export default function TicketDetailClient({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const id = parseInt(ticketId, 10);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');

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

  const descEditor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      LinkExt.configure({ openOnClick: false }),
      PlaceholderExt.configure({ placeholder: 'Add a description…' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700' } },
  });

  const commentEditor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExt,
      LinkExt.configure({ openOnClick: false }),
      PlaceholderExt.configure({ placeholder: 'Add a comment…' }),
    ],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700 min-h-[80px]' } },
  });

  const editCommentEditor = useEditor({
    extensions: [StarterKit, UnderlineExt, LinkExt.configure({ openOnClick: false })],
    content: '',
    editorProps: { attributes: { class: 'px-3 py-2 text-gray-700' } },
  });

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const base = API();
      const [t, c, h, ap, att, u] = await Promise.all([
        fetch(`${base}/tickets/${id}`).then(r => { if (!r.ok) throw new Error('Ticket not found'); return r.json(); }),
        fetch(`${base}/tickets/${id}/comments`).then(r => r.json()),
        fetch(`${base}/tickets/${id}/history`).then(r => r.json()),
        fetch(`${base}/tickets/${id}/approvals`).then(r => r.json()),
        fetch(`${base}/tickets/${id}/attachments`).then(r => r.json()),
        fetch(`${base}/users`).then(r => r.json()).catch(() => []),
      ]);
      setTicket(t);
      setComments(c);
      setHistory(h);
      setApprovals(ap);
      setAttachments(att);
      setUsers(Array.isArray(u) ? u : []);
      setTitleDraft(t.title);
      if (descEditor && t.description) {
        descEditor.commands.setContent(t.description);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [id, descEditor]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Patch ticket ────────────────────────────────────────────────────────────

  const patchTicket = async (fields: Record<string, unknown>) => {
    if (!ticket) return;
    const res = await fetch(`${API()}/tickets/${id}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, changed_by: null }),
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
      body: JSON.stringify({ body, created_by: null }),
    });
    commentEditor.commands.clearContent();
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
      body: JSON.stringify({ body: editCommentEditor.getHTML(), updated_by: null }),
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

  // ── Approvals ───────────────────────────────────────────────────────────────

  const requestApproval = async () => {
    await fetch(`${API()}/tickets/${id}/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_by: null }),
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
      body: JSON.stringify({ status, note: approvalNote || null, reviewed_by: null }),
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading ticket…</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">{error || 'Ticket not found'}</p>
          <button onClick={() => router.push('/tickets')} className="mt-4 text-sm text-blue-600 hover:underline">
            ← Back to tickets
          </button>
        </div>
      </div>
    );
  }

  const pendingApproval = approvals.find(a => a.status === 'pending');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => router.push('/tickets')}
          className="text-gray-500 hover:text-gray-800 flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Tickets</span>
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-mono text-gray-500">{ticket.ticket_number}</span>
        <div className="flex-1" />
        <button
          onClick={() => setShowAI(s => !s)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            showAI ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Bot size={15} />
          AI Assistant
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* ── Left main content ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* Title */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[ticket.type] || 'bg-gray-100 text-gray-600'}`}>
                {ticket.type}
              </span>
              <span className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</span>
            </div>
            {editingTitle ? (
              <div className="flex items-start gap-2">
                <input
                  autoFocus
                  type="text"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setEditingTitle(false); setTitleDraft(ticket.title); } }}
                  className="flex-1 text-2xl font-bold text-gray-900 border-b-2 border-blue-400 bg-transparent focus:outline-none"
                />
                <button onClick={saveTitle} className="text-green-600 hover:text-green-700 mt-1"><Check size={18} /></button>
                <button onClick={() => { setEditingTitle(false); setTitleDraft(ticket.title); }} className="text-gray-400 hover:text-gray-600 mt-1"><X size={18} /></button>
              </div>
            ) : (
              <h1
                className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-blue-700 transition-colors group flex items-start gap-2"
                onClick={() => setEditingTitle(true)}
              >
                {ticket.title}
                <Edit2 size={14} className="opacity-0 group-hover:opacity-40 mt-2 flex-shrink-0" />
              </h1>
            )}
          </div>

          {/* Description */}
          <div className="mb-6 bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Description</h3>
              {!editingDesc && (
                <button onClick={() => setEditingDesc(true)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                  <Edit2 size={12} /> Edit
                </button>
              )}
            </div>
            {editingDesc ? (
              <div>
                <Toolbar editor={descEditor} />
                <EditorContent editor={descEditor} />
                <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
                  <button onClick={saveDescription} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Save</button>
                  <button onClick={cancelDescription} className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className="tiptap-content px-4 py-3 text-gray-700 text-sm min-h-[60px] cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setEditingDesc(true)}
                dangerouslySetInnerHTML={{ __html: sanitize(ticket.description || '<p class="text-gray-400">Click to add a description…</p>') }}
              />
            )}
          </div>

          {/* Activity */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex border-b border-gray-200">
              {(['comments', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'comments' ? <MessageSquare size={14} /> : <Clock size={14} />}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="ml-1 text-xs bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                    {tab === 'comments' ? comments.length : history.length}
                  </span>
                </button>
              ))}
            </div>

            {activeTab === 'comments' && (
              <div className="p-4">
                {comments.length === 0 && <p className="text-sm text-gray-400 italic mb-4">No comments yet.</p>}
                {comments.map(c => (
                  <div key={c.id} className="mb-4 group">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center uppercase">
                        {(c.created_by_name || '?').charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-700">{c.created_by_name || 'Unknown'}</span>
                      <span className="text-xs text-gray-400">{fmt(c.created_at)}</span>
                      {c.edited_at && <span className="text-xs text-gray-400 italic">(edited)</span>}
                      <div className="flex-1" />
                      <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                        <button onClick={() => startEditComment(c)} className="p-1 text-gray-400 hover:text-blue-600"><Edit2 size={13} /></button>
                        <button onClick={() => deleteComment(c.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="ml-9 border border-gray-200 rounded-md overflow-hidden">
                        <Toolbar editor={editCommentEditor} />
                        <EditorContent editor={editCommentEditor} />
                        <div className="flex gap-2 px-3 py-2 border-t border-gray-100">
                          <button onClick={() => saveEditComment(c.id)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Save</button>
                          <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="ml-9 tiptap-content text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2"
                        dangerouslySetInnerHTML={{ __html: sanitize(c.body) }}
                      />
                    )}
                  </div>
                ))}
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">Add comment</div>
                  <div className="border border-gray-200 rounded-md overflow-hidden">
                    <Toolbar editor={commentEditor} />
                    <EditorContent editor={commentEditor} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={submitComment} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                      <Send size={13} /> Save
                    </button>
                    <button onClick={() => commentEditor?.commands.clearContent()} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-4">
                {history.length === 0 && <p className="text-sm text-gray-400 italic">No history yet.</p>}
                {history.map(h => (
                  <div key={h.id} className="flex gap-3 mb-3 text-sm">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center uppercase flex-shrink-0">
                      {(h.changed_by_name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-700">{h.changed_by_name || 'System'}</span>
                        <span className="text-gray-500">
                          {h.field_name === 'comment' ? 'added a comment' :
                           h.field_name === 'approval' ? `set approval to ${h.new_value}` :
                           `changed ${h.field_name.replace(/_/g, ' ')}`}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(h.created_at)}</span>
                      </div>
                      {h.field_name !== 'comment' && h.field_name !== 'approval' && (h.old_value || h.new_value) && (
                        <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
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
          </div>
        </div>

        {/* ── Right sidebar ───────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 space-y-4">

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Details</h4>
            <SidebarField label="Status" value={ticket.status}
              options={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In Progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' }]}
              onSave={v => v && patchTicket({ status: v })}
              renderValue={v => <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[v ?? ''] || 'bg-gray-100 text-gray-600'}`}>{v?.replace('_', ' ') || '—'}</span>}
            />
            <SidebarField label="Priority" value={ticket.priority}
              options={[{ value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]}
              onSave={v => v && patchTicket({ priority: v })}
              renderValue={v => <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLES[v ?? ''] || 'bg-gray-100 text-gray-600'}`}>{v || '—'}</span>}
            />
            <SidebarField label="Type" value={ticket.type}
              options={[{ value: 'bug', label: 'Bug' }, { value: 'task', label: 'Task' }, { value: 'improvement', label: 'Improvement' }, { value: 'question', label: 'Question' }]}
              onSave={v => v && patchTicket({ type: v })}
              renderValue={v => <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[v ?? ''] || 'bg-gray-100 text-gray-600'}`}>{v || '—'}</span>}
            />
            <SidebarField label="Assignee" value={ticket.assigned_to_id ? String(ticket.assigned_to_id) : null}
              options={userOptions}
              onSave={v => patchTicket({ assigned_to: v ? parseInt(v) : null })}
              renderValue={() => <span className="flex items-center gap-1.5"><User size={13} className="text-gray-400" />{ticket.assigned_to_name || <span className="text-gray-400">Unassigned</span>}</span>}
            />
            <SidebarField label="Reporter" value={ticket.created_by_name}
              renderValue={v => <span className="flex items-center gap-1.5"><User size={13} className="text-gray-400" />{v || <span className="text-gray-400">Unknown</span>}</span>}
            />
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="text-xs text-gray-400">Created {fmt(ticket.created_at)}</div>
              <div className="text-xs text-gray-400">Updated {fmt(ticket.updated_at)}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Links</h4>
            <SidebarField label="Customer" value={ticket.customer_name} />
            <SidebarField label="Pipeline" value={ticket.pipeline_name} />
            <SidebarField label="Release" value={ticket.release_name} />
            <SidebarField label="Agent" value={ticket.agent_name} />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resolution</h4>
            <SidebarField label="Root Cause" value={ticket.root_cause} onSave={v => patchTicket({ root_cause: v })} />
            <SidebarField label="Commands" value={ticket.resolution_commands} onSave={v => patchTicket({ resolution_commands: v })} />
            {ticket.resolved_at && (
              <div className="text-xs text-green-600 flex items-center gap-1 mt-1">
                <CheckCircle size={12} /> Resolved {fmt(ticket.resolved_at)}
              </div>
            )}
          </div>

          {/* Approvals */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Approvals</h4>
              {!pendingApproval && (
                <button onClick={requestApproval} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                  <Plus size={12} /> Request
                </button>
              )}
            </div>
            {approvals.length === 0 && <p className="text-xs text-gray-400 italic">No approvals requested.</p>}
            {approvals.map(a => (
              <div key={a.id} className="mb-3 last:mb-0 p-2 rounded-md bg-gray-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
                    a.status === 'approved' ? 'bg-green-100 text-green-700' :
                    a.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.status === 'approved' && <CheckCircle size={10} />}
                    {a.status === 'rejected' && <XCircle size={10} />}
                    {a.status === 'pending' && <Clock size={10} />}
                    {a.status}
                  </span>
                  <span className="text-xs text-gray-500">{fmt(a.created_at)}</span>
                </div>
                <div className="text-xs text-gray-500">by {a.requested_by_name || 'Unknown'}</div>
                {a.note && <div className="text-xs text-gray-600 mt-1 italic">{a.note}</div>}
                {a.status === 'pending' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Optional note…"
                      value={approvalNote}
                      onChange={e => setApprovalNote(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1.5 text-gray-700"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => reviewApproval(a.id, 'approved')} className="flex-1 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center justify-center gap-1">
                        <CheckCircle size={11} /> Approve
                      </button>
                      <button onClick={() => reviewApproval(a.id, 'rejected')} className="flex-1 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 flex items-center justify-center gap-1">
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Attachments ({attachments.length})</h4>
              <button onClick={() => attachInputRef.current?.click()} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload
              </button>
            </div>
            <input ref={attachInputRef} type="file" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }}
            />
            {attachments.length === 0 && <p className="text-xs text-gray-400 italic">No attachments.</p>}
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 group">
                <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-700 truncate">{a.original_filename}</div>
                  {a.file_size && <div className="text-xs text-gray-400">{fmtSize(a.file_size)}</div>}
                </div>
                <a href={`${API()}/ticket-attachments/${a.id}/download`} target="_blank" rel="noreferrer" className="p-1 text-gray-400 hover:text-blue-600 flex-shrink-0">
                  <Download size={12} />
                </a>
                <button onClick={() => deleteAttachment(a.id)} className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 flex-shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Chat Panel ──────────────────────────────────────────────────────── */}
      {showAI && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl flex flex-col z-30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-purple-50">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-purple-600" />
              <span className="font-semibold text-gray-800 text-sm">AI Assistant</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setChatMsgs([])} className="text-xs text-gray-500 hover:text-gray-700" title="Clear chat">
                <MoreHorizontal size={15} />
              </button>
              <button onClick={() => setShowAI(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMsgs.length === 0 && (
              <div className="text-center text-gray-400 text-sm mt-8">
                <Bot size={32} className="mx-auto mb-2 text-purple-200" />
                <p>Ask anything about this ticket or related issues.</p>
                <div className="mt-4 space-y-1.5">
                  {['Summarize this ticket', 'What might be the root cause?', 'Suggest resolution steps'].map(s => (
                    <button key={s} onClick={() => setChatInput(s)} className="block w-full text-xs text-left px-3 py-1.5 rounded border border-gray-200 hover:border-purple-300 hover:text-purple-700 text-gray-600 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                  {m.role === 'assistant' && !m.content && chatLoading
                    ? <Loader2 size={14} className="animate-spin text-gray-400" />
                    : <div className="whitespace-pre-wrap">{m.content}</div>
                  }
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div className="p-3 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIMessage(); } }}
                placeholder="Ask about this ticket…"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:border-purple-400 focus:outline-none"
              />
              <button onClick={sendAIMessage} disabled={chatLoading || !chatInput.trim()} className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
