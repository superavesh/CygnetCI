'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Ticket, Plus, Search, LayoutList, LayoutGrid,
  ChevronDown, X, Edit2, Trash2,
  AlertCircle, CheckCircle2, Circle, Loader2, RefreshCw,
  Terminal, BookOpen, Wrench, HelpCircle,
  Building2, GitBranch, Rocket, Server, Save, GripVertical,
  Paperclip, Upload, Download, FileText, Image, File
} from 'lucide-react';
import { CONFIG } from '@/lib/config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TicketItem {
  id: number;
  ticket_number: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'bug' | 'task' | 'improvement' | 'question';
  created_by_id: number | null;
  created_by_name: string | null;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  pipeline_id: number | null;
  pipeline_name: string | null;
  release_id: number | null;
  release_name: string | null;
  agent_id: number | null;
  agent_name: string | null;
  root_cause: string | null;
  resolution_steps: string[];
  resolution_commands: string | null;
  resolved_by_id: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserOption { id: number; username: string; full_name: string | null; }
interface CustomerOption { id: number; display_name: string; }
interface PipelineOption { id: number; name: string; }
interface ReleaseOption { id: number; name: string; }
interface AgentOption { id: number; name: string; }

interface TicketAttachment {
  id: number;
  ticket_id: number;
  original_filename: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by_id: number | null;
  uploaded_by_name: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:        { label: 'Open',        color: 'bg-blue-100 text-blue-700 border-blue-200',    icon: <Circle className="h-3 w-3" /> },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  resolved:    { label: 'Resolved',    color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="h-3 w-3" /> },
  closed:      { label: 'Closed',      color: 'bg-gray-100 text-gray-600 border-gray-200',    icon: <CheckCircle2 className="h-3 w-3" /> },
};

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 border-red-200',       dot: 'bg-red-500' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-500' },
  low:      { label: 'Low',      color: 'bg-gray-100 text-gray-600 border-gray-200',     dot: 'bg-gray-400' },
};

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  bug:         { label: 'Bug',         color: 'bg-red-50 text-red-600 border-red-200',      icon: <AlertCircle className="h-3 w-3" /> },
  task:        { label: 'Task',        color: 'bg-blue-50 text-blue-600 border-blue-200',   icon: <Ticket className="h-3 w-3" /> },
  improvement: { label: 'Improvement', color: 'bg-purple-50 text-purple-600 border-purple-200', icon: <Wrench className="h-3 w-3" /> },
  question:    { label: 'Question',    color: 'bg-teal-50 text-teal-600 border-teal-200',   icon: <HelpCircle className="h-3 w-3" /> },
};

const BOARD_COLUMNS = ['open', 'in_progress', 'resolved', 'closed'] as const;
const BOARD_HEADER: Record<string, string> = {
  open: 'bg-blue-500', in_progress: 'bg-yellow-500', resolved: 'bg-green-500', closed: 'bg-gray-500'
};

function avatar(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Badge components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.medium;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const m = TYPE_META[type] ?? TYPE_META.task;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'board'>('list');

  // filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');

  // modals
  const [showCreate, setShowCreate] = useState(false);

  // option lists
  const [users, setUsers] = useState<UserOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterType) params.set('type', filterType);
      if (filterAssignee) params.set('assigned_to', filterAssignee);
      if (search) params.set('search', search);
      const res = await fetch(`${CONFIG.api.baseUrl}/tickets?${params}`);
      if (res.ok) setTickets(await res.json());
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterPriority, filterType, filterAssignee]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    Promise.all([
      fetch(`${CONFIG.api.baseUrl}/users`).then(r => r.ok ? r.json() : []),
      fetch(`${CONFIG.api.baseUrl}/customers`).then(r => r.ok ? r.json() : []),
      fetch(`${CONFIG.api.baseUrl}/pipelines`).then(r => r.ok ? r.json() : []),
      fetch(`${CONFIG.api.baseUrl}/releases`).then(r => r.ok ? r.json() : []),
      fetch(`${CONFIG.api.baseUrl}/agents`).then(r => r.ok ? r.json() : []),
    ]).then(([u, c, p, rel, ag]) => {
      setUsers(u);
      setCustomers(c);
      setPipelines(p);
      setReleases(rel);
      setAgents(ag);
    });
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this ticket?')) return;
    await fetch(`${CONFIG.api.baseUrl}/tickets/${id}`, { method: 'DELETE', headers: CONFIG.api.headers });
    fetchTickets();
  };

  const handleStatusChange = async (ticket: TicketItem, newStatus: string) => {
    await fetch(`${CONFIG.api.baseUrl}/tickets/${ticket.id}`, {
      method: 'PUT',
      headers: CONFIG.api.headers,
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTickets();
  };

  // ── filtered list ──
  const filtered = tickets.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
        !t.ticket_number.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description?.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterType && t.type !== filterType) return false;
    if (filterAssignee && String(t.assigned_to_id) !== filterAssignee) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-auto bg-gray-50 min-h-screen">
      <div className="max-w-screen-2xl mx-auto px-6 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Ticket className="h-7 w-7 text-blue-600" /> Tickets
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Create, assign and track issue resolution</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchTickets} title="Refresh" className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600 hover:text-gray-900">
              <RefreshCw className="h-4 w-4" />
            </button>
            {/* view toggle */}
            <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setView('list')} className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                <LayoutList className="h-4 w-4" /> List
              </button>
              <button onClick={() => setView('board')} className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${view === 'board' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                <LayoutGrid className="h-4 w-4" /> Board
              </button>
            </div>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-blue-600 hover:to-purple-700 transition-all shadow-sm">
              <Plus className="h-4 w-4" /> New Ticket
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            />
          </div>
          <Select value={filterStatus} onChange={setFilterStatus} placeholder="All Statuses">
            <option value="">All Statuses</option>
            {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </Select>
          <Select value={filterPriority} onChange={setFilterPriority} placeholder="All Priorities">
            <option value="">All Priorities</option>
            {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </Select>
          <Select value={filterType} onChange={setFilterType} placeholder="All Types">
            <option value="">All Types</option>
            {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </Select>
          <Select value={filterAssignee} onChange={setFilterAssignee} placeholder="All Assignees">
            <option value="">All Assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
          </Select>
          {(filterStatus || filterPriority || filterType || filterAssignee || search) && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); setFilterType(''); setFilterAssignee(''); }}
              className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : view === 'list' ? (
          <ListView tickets={filtered} onOpen={(t) => router.push(`/tickets/${t.id}`)} onDelete={handleDelete} />
        ) : (
          <BoardView tickets={filtered} onOpen={(t) => router.push(`/tickets/${t.id}`)} onStatusChange={handleStatusChange} />
        )}
      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <CreateModal
          users={users} customers={customers} pipelines={pipelines} releases={releases} agents={agents}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchTickets(); }}
        />
      )}
    </div>
  );
}

// ─── Shared Select ────────────────────────────────────────────────────────────

function Select({ value, onChange, placeholder, children }: {
  value: string; onChange: (v: string) => void; placeholder?: string; children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ tickets, onOpen, onDelete }: {
  tickets: TicketItem[];
  onOpen: (t: TicketItem) => void;
  onDelete: (id: number) => void;
}) {
  if (tickets.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
        <Ticket className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No tickets found</p>
        <p className="text-gray-400 text-sm mt-1">Create a ticket to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3 text-left w-28">Ticket</th>
            <th className="px-4 py-3 text-left">Title</th>
            <th className="px-4 py-3 text-left w-28">Type</th>
            <th className="px-4 py-3 text-left w-28">Priority</th>
            <th className="px-4 py-3 text-left w-32">Status</th>
            <th className="px-4 py-3 text-left w-36">Assignee</th>
            <th className="px-4 py-3 text-left w-36">Customer</th>
            <th className="px-4 py-3 text-left w-28">Created</th>
            <th className="px-4 py-3 w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tickets.map(t => (
            <tr key={t.id} onClick={() => onOpen(t)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
              <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{t.ticket_number}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 truncate max-w-xs">{t.title}</p>
                {t.description && <p className="text-xs text-gray-400 truncate max-w-xs mt-0.5">{t.description}</p>}
              </td>
              <td className="px-4 py-3"><TypeBadge type={t.type} /></td>
              <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
              <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
              <td className="px-4 py-3">
                {t.assigned_to_name ? (
                  <div className="flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {avatar(t.assigned_to_name)}
                    </span>
                    <span className="text-gray-700 truncate">{t.assigned_to_name}</span>
                  </div>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-gray-500 truncate">{t.customer_name ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{relativeTime(t.created_at)}</td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <button onClick={() => onDelete(t.id)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ tickets, onOpen, onStatusChange }: {
  tickets: TicketItem[];
  onOpen: (t: TicketItem) => void;
  onStatusChange: (t: TicketItem, s: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const handleDrop = (col: string) => {
    if (draggingId === null) return;
    const ticket = tickets.find(t => t.id === draggingId);
    if (ticket && ticket.status !== col) onStatusChange(ticket, col);
    setDraggingId(null);
    setDragOverCol(null);
  };

  return (
    <div className="grid grid-cols-4 gap-4">
      {BOARD_COLUMNS.map(col => {
        const colTickets = tickets.filter(t => t.status === col);
        const isOver = dragOverCol === col && draggingId !== null;
        const draggingTicket = tickets.find(t => t.id === draggingId);
        const sameCol = draggingTicket?.status === col;

        return (
          <div
            key={col}
            className="flex flex-col gap-3"
            onDragOver={e => { e.preventDefault(); setDragOverCol(col); }}
            onDragLeave={e => {
              const related = e.relatedTarget as Node | null;
              if (!related || !e.currentTarget.contains(related)) setDragOverCol(null);
            }}
            onDrop={() => handleDrop(col)}
          >
            <div className={`rounded-lg px-3 py-2 flex items-center justify-between text-white font-semibold text-sm ${BOARD_HEADER[col]}`}>
              <span>{STATUS_META[col].label}</span>
              <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">{colTickets.length}</span>
            </div>
            <div className={`flex flex-col gap-2 min-h-24 rounded-xl p-2 -m-2 transition-all duration-150 ${
              isOver && !sameCol
                ? 'bg-blue-50 ring-2 ring-blue-300 ring-inset'
                : ''
            }`}>
              {colTickets.map(t => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  onOpen={onOpen}
                  isDragging={draggingId === t.id}
                  onDragStart={() => setDraggingId(t.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                />
              ))}
              {colTickets.length === 0 && (
                <div className={`rounded-lg border-2 border-dashed flex items-center justify-center h-20 text-xs transition-colors ${
                  isOver && !sameCol
                    ? 'border-blue-400 text-blue-400 bg-blue-50'
                    : 'border-gray-200 text-gray-300'
                }`}>
                  {isOver && !sameCol ? 'Drop here' : 'No tickets'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TicketCard({ ticket: t, onOpen, isDragging, onDragStart, onDragEnd }: {
  ticket: TicketItem;
  onOpen: (t: TicketItem) => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={() => { if (!isDragging) onOpen(t); }}
      className={`bg-white rounded-lg border p-3 select-none transition-all duration-150 ${
        isDragging
          ? 'opacity-40 scale-95 border-blue-300 shadow-none cursor-grabbing'
          : 'border-gray-200 hover:shadow-md hover:border-blue-200 cursor-grab active:cursor-grabbing'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
          <span className="font-mono text-xs text-blue-500 font-semibold">{t.ticket_number}</span>
        </div>
        <PriorityBadge priority={t.priority} />
      </div>
      <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{t.title}</p>
      <div className="flex items-center justify-between">
        <TypeBadge type={t.type} />
        {t.assigned_to_name && (
          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0" title={t.assigned_to_name}>
            {avatar(t.assigned_to_name)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ users, customers, pipelines, releases, agents, onClose, onCreated }: {
  users: UserOption[]; customers: CustomerOption[]; pipelines: PipelineOption[];
  releases: ReleaseOption[]; agents: AgentOption[];
  onClose: () => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '', description: '', priority: 'medium', type: 'task',
    assigned_to: '', created_by: '',
    customer_id: '', pipeline_id: '', release_id: '', agent_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.api.baseUrl}/tickets`, {
        method: 'POST',
        headers: CONFIG.api.headers,
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          priority: form.priority,
          type: form.type,
          assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
          created_by: form.created_by ? Number(form.created_by) : null,
          customer_id: form.customer_id ? Number(form.customer_id) : null,
          pipeline_id: form.pipeline_id ? Number(form.pipeline_id) : null,
          release_id: form.release_id ? Number(form.release_id) : null,
          agent_id: form.agent_id ? Number(form.agent_id) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-br from-blue-500 to-purple-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Plus className="h-5 w-5" />
            <h2 className="text-lg font-bold">New Ticket</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Short summary of the issue…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} placeholder="Detailed description…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-700" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModalField label="Priority">
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={FIELD_CLASS}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </ModalField>
            <ModalField label="Type">
              <select value={form.type} onChange={e => set('type', e.target.value)} className={FIELD_CLASS}>
                <option value="bug">Bug</option>
                <option value="task">Task</option>
                <option value="improvement">Improvement</option>
                <option value="question">Question</option>
              </select>
            </ModalField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ModalField label="Assign To">
              <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={FIELD_CLASS}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </ModalField>
            <ModalField label="Created By">
              <select value={form.created_by} onChange={e => set('created_by', e.target.value)} className={FIELD_CLASS}>
                <option value="">Select user</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
              </select>
            </ModalField>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Link to (optional)</p>
            <div className="grid grid-cols-2 gap-4">
              <ModalField label={<><Building2 className="h-3 w-3 inline mr-1" />Customer</>}>
                <select value={form.customer_id} onChange={e => set('customer_id', e.target.value)} className={FIELD_CLASS}>
                  <option value="">None</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
              </ModalField>
              <ModalField label={<><Server className="h-3 w-3 inline mr-1" />Agent</>}>
                <select value={form.agent_id} onChange={e => set('agent_id', e.target.value)} className={FIELD_CLASS}>
                  <option value="">None</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </ModalField>
              <ModalField label={<><GitBranch className="h-3 w-3 inline mr-1" />Pipeline</>}>
                <select value={form.pipeline_id} onChange={e => set('pipeline_id', e.target.value)} className={FIELD_CLASS}>
                  <option value="">None</option>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </ModalField>
              <ModalField label={<><Rocket className="h-3 w-3 inline mr-1" />Release</>}>
                <select value={form.release_id} onChange={e => set('release_id', e.target.value)} className={FIELD_CLASS}>
                  <option value="">None</option>
                  {releases.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </ModalField>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium hover:from-blue-600 hover:to-purple-700 disabled:opacity-60 flex items-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const FIELD_CLASS = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700";

function ModalField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ ticket, users, customers, pipelines, releases, agents, onClose, onUpdated, onDeleted }: {
  ticket: TicketItem;
  users: UserOption[]; customers: CustomerOption[]; pipelines: PipelineOption[];
  releases: ReleaseOption[]; agents: AgentOption[];
  onClose: () => void;
  onUpdated: (t: TicketItem) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // editable fields
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [type, setType] = useState(ticket.type);
  const [assignedTo, setAssignedTo] = useState(String(ticket.assigned_to_id ?? ''));
  const [customerId, setCustomerId] = useState(String(ticket.customer_id ?? ''));
  const [pipelineId, setPipelineId] = useState(String(ticket.pipeline_id ?? ''));
  const [releaseId, setReleaseId] = useState(String(ticket.release_id ?? ''));
  const [agentId, setAgentId] = useState(String(ticket.agent_id ?? ''));

  // resolution fields
  const [rootCause, setRootCause] = useState(ticket.root_cause ?? '');
  const [steps, setSteps] = useState<string[]>(ticket.resolution_steps.length ? ticket.resolution_steps : ['']);
  const [commands, setCommands] = useState(ticket.resolution_commands ?? '');
  const [resolvedBy, setResolvedBy] = useState(String(ticket.resolved_by_id ?? ''));

  // attachments
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    fetch(`${CONFIG.api.baseUrl}/tickets/${ticket.id}/attachments`)
      .then(r => r.ok ? r.json() : [])
      .then(setAttachments)
      .finally(() => setAttachmentsLoading(false));
  }, [ticket.id]);

  const uploadFiles = async (files: FileList | File[]) => {
    setUploading(true);
    const newAttachments: TicketAttachment[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch(`${CONFIG.api.baseUrl}/tickets/${ticket.id}/attachments`, {
          method: 'POST',
          body: fd,
        });
        if (res.ok) newAttachments.push(await res.json());
      } catch { /* individual file failure — continue */ }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
    setUploading(false);
  };

  const handleDeleteAttachment = async (id: number) => {
    if (!confirm('Remove this attachment?')) return;
    await fetch(`${CONFIG.api.baseUrl}/ticket-attachments/${id}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.api.baseUrl}/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: CONFIG.api.headers,
        body: JSON.stringify({
          title, description: description || null, status, priority, type,
          assigned_to: assignedTo ? Number(assignedTo) : null,
          customer_id: customerId ? Number(customerId) : null,
          pipeline_id: pipelineId ? Number(pipelineId) : null,
          release_id: releaseId ? Number(releaseId) : null,
          agent_id: agentId ? Number(agentId) : null,
          root_cause: rootCause || null,
          resolution_steps: steps.filter(s => s.trim()),
          resolution_commands: commands || null,
          resolved_by: resolvedBy ? Number(resolvedBy) : null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdated(updated);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const statusColor: Record<string, string> = {
    open: 'border-blue-400', in_progress: 'border-yellow-400', resolved: 'border-green-400', closed: 'border-gray-400'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border-t-4 ${statusColor[status]}`}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-blue-600 font-bold">{ticket.ticket_number}</span>
              <TypeBadge type={type} />
              <PriorityBadge priority={priority} />
            </div>
            {editing ? (
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-xl font-bold text-gray-900 border-b-2 border-blue-400 focus:outline-none pb-1 bg-transparent" />
            ) : (
              <h2 className="text-xl font-bold text-gray-900 truncate">{title}</h2>
            )}
          </div>
          <div className="flex items-center gap-2 ml-4 flex-shrink-0">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
                <Edit2 className="h-3 w-3" /> Edit
              </button>
            )}
            <button onClick={onClose} title="Close" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-3 gap-6">
          {/* ── Left col (main content) ── */}
          <div className="col-span-2 space-y-5">
            {/* Description */}
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" /> Description</p>
              {editing ? (
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={4} placeholder="Add a description…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-gray-700" />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{description || <span className="italic text-gray-400">No description</span>}</p>
              )}
            </section>

            {/* Resolution Section */}
            <section className="bg-gray-50 rounded-xl p-4 space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Resolution Details</p>

              {/* Root Cause */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Root Cause</label>
                <textarea value={rootCause} onChange={e => setRootCause(e.target.value)}
                  rows={2} placeholder="What caused this issue?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white text-gray-700" />
              </div>

              {/* Steps to Resolve */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Steps to Resolve</label>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center flex-shrink-0 mt-1.5 font-semibold">{i + 1}</span>
                      <input value={step} onChange={e => setSteps(s => s.map((v, j) => j === i ? e.target.value : v))}
                        placeholder={`Step ${i + 1}…`}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-gray-700" />
                      {steps.length > 1 && (
                        <button onClick={() => setSteps(s => s.filter((_, j) => j !== i))} className="mt-1.5 text-gray-300 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setSteps(s => [...s, ''])}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mt-1">
                    <Plus className="h-3 w-3" /> Add step
                  </button>
                </div>
              </div>

              {/* Code / Commands */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Terminal className="h-3 w-3" /> Code / Commands</label>
                <textarea value={commands} onChange={e => setCommands(e.target.value)}
                  rows={4} placeholder="Paste relevant code, commands, or scripts…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-900 text-green-400" />
              </div>

              {/* Resolved By */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Resolved By</label>
                  <select value={resolvedBy} onChange={e => setResolvedBy(e.target.value)} className={FIELD_CLASS}>
                    <option value="">Select user</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                  </select>
                </div>
                {ticket.resolved_at && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Resolved At</label>
                    <p className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600">
                      {new Date(ticket.resolved_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* ── Attachments ── */}
            <section>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Attachments
                {attachments.length > 0 && (
                  <span className="bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-xs font-semibold">{attachments.length}</span>
                )}
              </p>

              {/* File list */}
              {attachmentsLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading attachments…
                </div>
              ) : attachments.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-3">
                  {attachments.map(att => {
                    const isImg = att.mime_type?.startsWith('image/');
                    const downloadUrl = `${CONFIG.api.baseUrl}/ticket-attachments/${att.id}/download`;
                    const sizeLabel = att.file_size
                      ? att.file_size < 1024 ? `${att.file_size} B`
                        : att.file_size < 1048576 ? `${(att.file_size / 1024).toFixed(1)} KB`
                        : `${(att.file_size / 1048576).toFixed(1)} MB`
                      : '';
                    return (
                      <div key={att.id} className="flex items-center gap-3 px-3 py-2.5 group hover:bg-gray-50">
                        <span className="flex-shrink-0 text-gray-400">
                          {isImg ? <Image className="h-4 w-4 text-blue-400" /> : <FileText className="h-4 w-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate font-medium">{att.original_filename}</p>
                          <p className="text-xs text-gray-400">{sizeLabel}{att.uploaded_by_name ? ` · ${att.uploaded_by_name}` : ''}</p>
                        </div>
                        <a href={downloadUrl} download={att.original_filename} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                        <button onClick={() => handleDeleteAttachment(att.id)}
                          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all" title="Remove">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Upload drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg px-4 py-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/40'}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </div>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-gray-300 mx-auto mb-1.5" />
                    <p className="text-xs text-gray-500">Drop files or <span className="text-blue-500 font-medium">click to browse</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">Screenshots, logs, any file type</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />
              </div>
            </section>
          </div>

          {/* ── Right col (metadata) ── */}
          <div className="space-y-4">
            <MetaSection title="Status">
              {editing ? (
                <select value={status} onChange={e => setStatus(e.target.value as TicketItem['status'])} className={FIELD_CLASS}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              ) : <StatusBadge status={status} />}
            </MetaSection>

            <MetaSection title="Priority">
              {editing ? (
                <select value={priority} onChange={e => setPriority(e.target.value as TicketItem['priority'])} className={FIELD_CLASS}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              ) : <PriorityBadge priority={priority} />}
            </MetaSection>

            <MetaSection title="Type">
              {editing ? (
                <select value={type} onChange={e => setType(e.target.value as TicketItem['type'])} className={FIELD_CLASS}>
                  <option value="bug">Bug</option>
                  <option value="task">Task</option>
                  <option value="improvement">Improvement</option>
                  <option value="question">Question</option>
                </select>
              ) : <TypeBadge type={type} />}
            </MetaSection>

            <MetaSection title="Assignee">
              {editing ? (
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={FIELD_CLASS}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
                </select>
              ) : ticket.assigned_to_name ? (
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    {avatar(ticket.assigned_to_name)}
                  </span>
                  <span className="text-sm text-gray-700">{ticket.assigned_to_name}</span>
                </div>
              ) : <span className="text-sm text-gray-400">Unassigned</span>}
            </MetaSection>

            <MetaSection title="Reporter">
              <span className="text-sm text-gray-700">{ticket.created_by_name ?? <span className="text-gray-400">Unknown</span>}</span>
            </MetaSection>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Links</p>
              <MetaSection title={<><Building2 className="h-3 w-3 inline mr-1" />Customer</>}>
                {editing ? (
                  <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={FIELD_CLASS}>
                    <option value="">None</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                ) : <span className="text-sm text-gray-700">{ticket.customer_name ?? <span className="text-gray-400">—</span>}</span>}
              </MetaSection>
              <MetaSection title={<><GitBranch className="h-3 w-3 inline mr-1" />Pipeline</>}>
                {editing ? (
                  <select value={pipelineId} onChange={e => setPipelineId(e.target.value)} className={FIELD_CLASS}>
                    <option value="">None</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : <span className="text-sm text-gray-700">{ticket.pipeline_name ?? <span className="text-gray-400">—</span>}</span>}
              </MetaSection>
              <MetaSection title={<><Rocket className="h-3 w-3 inline mr-1" />Release</>}>
                {editing ? (
                  <select value={releaseId} onChange={e => setReleaseId(e.target.value)} className={FIELD_CLASS}>
                    <option value="">None</option>
                    {releases.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                ) : <span className="text-sm text-gray-700">{ticket.release_name ?? <span className="text-gray-400">—</span>}</span>}
              </MetaSection>
              <MetaSection title={<><Server className="h-3 w-3 inline mr-1" />Agent</>}>
                {editing ? (
                  <select value={agentId} onChange={e => setAgentId(e.target.value)} className={FIELD_CLASS}>
                    <option value="">None</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : <span className="text-sm text-gray-700">{ticket.agent_name ?? <span className="text-gray-400">—</span>}</span>}
              </MetaSection>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-1 text-xs text-gray-400">
              <p>Created {new Date(ticket.created_at).toLocaleString()}</p>
              <p>Updated {relativeTime(ticket.updated_at)}</p>
            </div>

            <button onClick={async () => { if (!confirm('Delete this ticket?')) return; await fetch(`${CONFIG.api.baseUrl}/tickets/${ticket.id}`, { method: 'DELETE', headers: CONFIG.api.headers }); onDeleted(); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 transition-colors mt-2">
              <Trash2 className="h-4 w-4" /> Delete Ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-1">{title}</p>
      {children}
    </div>
  );
}
