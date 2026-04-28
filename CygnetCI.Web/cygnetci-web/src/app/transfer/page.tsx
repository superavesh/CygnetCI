'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Send, FileText, Package, Trash2, RefreshCw, Download, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import { useCustomer } from '@/lib/contexts/CustomerContext';
import type { TransferFile, TransferFilePickup } from '@/types';
import { TransferHistoryModal } from '@/components/transfer/TransferHistoryModal';

const PICKUPS_PAGE_SIZE = 10;
const FILES_PAGE_SIZE = 10;

// ─── Pagination control ───────────────────────────────────────────────────────
function Pagination({
  page, totalPages, onPage,
}: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
      <span className="text-xs text-gray-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = totalPages <= 7 ? i + 1
            : page <= 4 ? i + 1
            : page >= totalPages - 3 ? totalPages - 6 + i
            : page - 3 + i;
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}

export default function TransferPage() {
  const { selectedCustomer } = useCustomer();

  // Upload Section State
  const [uploadFileType, setUploadFileType] = useState<'script' | 'artifact'>('script');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedBytes, setUploadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);

  // Push Section State
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [allFiles, setAllFiles] = useState<TransferFile[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<any[]>([]);
  const [pushFileType, setPushFileType] = useState<'script' | 'artifact'>('script');
  const [pushVersion, setPushVersion] = useState('');
  const [pushFile, setPushFile] = useState('');
  const [pushAgent, setPushAgent] = useState('');
  const [pushRequestedBy, setPushRequestedBy] = useState('');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);

  // Files List State
  const [filesLoading, setFilesLoading] = useState(false);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [pickups, setPickups] = useState<TransferFilePickup[]>([]);
  const [pickupsLoading, setPickupsLoading] = useState(false);

  // Pagination
  const [pickupsPage, setPickupsPage] = useState(1);
  const [allFilesPage, setAllFilesPage] = useState(1);

  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryFile, setSelectedHistoryFile] = useState<TransferFile | null>(null);

  useEffect(() => {
    fetchVersions();
    fetchAgents();
    fetchPickups();
    fetchAllFiles();
  }, []);

  useEffect(() => {
    if (selectedCustomer && agents.length > 0) {
      setFilteredAgents(agents.filter(a => a.customerId === selectedCustomer.id));
      setPushAgent('');
    } else {
      setFilteredAgents(agents);
    }
  }, [selectedCustomer, agents]);

  useEffect(() => {
    if (pushFileType || pushVersion) fetchFiles();
  }, [pushFileType, pushVersion]);

  // Auto-refresh pickups every 5 s while any download is in progress
  useEffect(() => {
    const hasActive = pickups.some(p => p.status === 'pending' || p.status === 'downloading');
    if (!hasActive) return;
    const id = setInterval(fetchPickups, 5000);
    return () => clearInterval(id);
  }, [pickups]);

  const fetchFiles = async () => {
    try {
      setFilesLoading(true);
      setFiles(await apiService.getTransferFiles(pushFileType, pushVersion));
    } catch { } finally { setFilesLoading(false); }
  };

  const fetchAllFiles = async () => {
    try {
      setAllFilesLoading(true);
      setAllFiles(await apiService.getTransferFiles());
    } catch { } finally { setAllFilesLoading(false); }
  };

  const fetchVersions = async () => {
    try { setVersions(await apiService.getVersions()); } catch { }
  };

  const fetchAgents = async () => {
    try {
      const data = await apiService.getAgents();
      setAgents(data);
      setFilteredAgents(data);
    } catch { }
  };

  const fetchPickups = useCallback(async () => {
    try {
      setPickupsLoading(true);
      setPickups(await apiService.getPickups());
    } catch { } finally { setPickupsLoading(false); }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) { setSelectedFile(e.target.files[0]); setUploadError(null); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null); setUploadSuccess(null);
    if (!selectedFile) { setUploadError('Please select a file'); return; }
    if (!uploadVersion.trim()) { setUploadError('Please enter a version'); return; }
    try {
      setUploadLoading(true); setUploadProgress(0); setUploadedBytes(0); setTotalBytes(0);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('file_type', uploadFileType);
      formData.append('version', uploadVersion.trim());
      if (uploadedBy.trim()) formData.append('uploaded_by', uploadedBy.trim());
      if (description.trim()) formData.append('description', description.trim());
      const result = await apiService.uploadFileWithProgress(formData, (pct, loaded, total) => {
        setUploadProgress(pct); setUploadedBytes(loaded); setTotalBytes(total);
      });
      setUploadSuccess(`File uploaded successfully: ${result.file?.file_name || selectedFile.name}`);
      setSelectedFile(null); setUploadVersion(''); setDescription('');
      const fi = document.getElementById('file-input') as HTMLInputElement;
      if (fi) fi.value = '';
      fetchFiles(); fetchAllFiles(); fetchVersions();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload file');
    } finally { setUploadLoading(false); setUploadProgress(0); }
  };

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    setPushError(null); setPushSuccess(null);
    if (!pushFile) { setPushError('Please select a file'); return; }
    if (!pushAgent) { setPushError('Please select an agent'); return; }
    try {
      setPushLoading(true);
      const selectedAgent = agents.find(a => a.uuid === pushAgent);
      await apiService.pushFileToAgent({
        transfer_file_id: parseInt(pushFile),
        agent_uuid: pushAgent,
        agent_name: selectedAgent?.name,
        requested_by: pushRequestedBy.trim() || undefined,
      });
      setPushSuccess('File pushed to agent successfully!');
      setPushFile(''); setPushAgent(''); setPushRequestedBy('');
      fetchPickups();
    } catch (err: any) {
      setPushError(err.message || 'Failed to push file');
    } finally { setPushLoading(false); }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    try {
      await apiService.deleteTransferFile(fileId);
      await fetchFiles(); await fetchAllFiles();
    } catch { alert('Failed to delete file'); }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const s = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + s[i];
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':     return 'bg-amber-500 text-white';
      case 'downloading': return 'bg-blue-500 text-white';
      case 'downloaded':  return 'bg-green-600 text-white';
      case 'failed':      return 'bg-red-600 text-white';
      default:            return 'bg-gray-500 text-white';
    }
  };

  // Paginated slices
  const pickupsTotalPages = Math.max(1, Math.ceil(pickups.length / PICKUPS_PAGE_SIZE));
  const pagedPickups = pickups.slice((pickupsPage - 1) * PICKUPS_PAGE_SIZE, pickupsPage * PICKUPS_PAGE_SIZE);

  const filesTotalPages = Math.max(1, Math.ceil(allFiles.length / FILES_PAGE_SIZE));
  const pagedFiles = allFiles.slice((allFilesPage - 1) * FILES_PAGE_SIZE, allFilesPage * FILES_PAGE_SIZE);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Upload className="h-8 w-8 text-blue-600" />
          File Transfer Management
        </h1>
        <p className="text-gray-600 mt-1">Upload scripts and artifacts, and push them to agents</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Upload className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Upload Files</h2>
          </div>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                {(['script', 'artifact'] as const).map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={t} checked={uploadFileType === t}
                      onChange={() => setUploadFileType(t)}
                      className="text-blue-600 focus:ring-blue-500" />
                    {t === 'script' ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    <span className="text-gray-700 capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Version <span className="text-red-500">*</span></label>
              <input type="text" value={uploadVersion} onChange={e => setUploadVersion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="v1.0.0" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select File <span className="text-red-500">*</span></label>
              <input id="file-input" type="file" onChange={handleFileSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                required />
              {selectedFile && (
                <p className="text-xs text-gray-500 mt-1">Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Uploaded By</label>
              <input type="text" value={uploadedBy} onChange={e => setUploadedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Optional description" rows={2} />
            </div>
            {uploadLoading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-700">
                  <span>Uploading... {uploadProgress}%</span>
                  <span>{formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${uploadProgress}%`,
                      background: uploadProgress === 100
                        ? 'linear-gradient(90deg, #16a34a, #22c55e)'
                        : 'linear-gradient(90deg, #2563eb, #3b82f6)',
                    }} />
                </div>
                {uploadProgress === 100 && <p className="text-xs text-gray-500">Processing file on server...</p>}
              </div>
            )}
            {uploadError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{uploadError}</div>}
            {uploadSuccess && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">{uploadSuccess}</div>}
            <button type="submit" disabled={uploadLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              {uploadLoading ? `Uploading... ${uploadProgress}%` : 'Upload File'}
            </button>
          </form>
        </div>

        {/* Push Section */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Send className="h-6 w-6 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Push to Agent</h2>
          </div>
          <form onSubmit={handlePush} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">File Type <span className="text-red-500">*</span></label>
              <div className="flex gap-4">
                {(['script', 'artifact'] as const).map(t => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={t} checked={pushFileType === t}
                      onChange={() => setPushFileType(t)}
                      className="text-green-600 focus:ring-green-500" />
                    {t === 'script' ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    <span className="text-gray-700 capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Version</label>
              <select value={pushVersion} onChange={e => { setPushVersion(e.target.value); setPushFile(''); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white">
                <option value="">All Versions</option>
                {versions.map((v, i) => <option key={i} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select File <span className="text-red-500">*</span></label>
              <select value={pushFile} onChange={e => setPushFile(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                required disabled={filesLoading}>
                <option value="">Select a file...</option>
                {files.map((f, i) => (
                  <option key={i} value={f.id}>{f.file_name} (v{f.version}) - {formatFileSize(f.file_size_bytes)}</option>
                ))}
              </select>
              {filesLoading && <p className="text-xs text-gray-500 mt-1">Loading files...</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Target Agent <span className="text-red-500">*</span></label>
              <select value={pushAgent} onChange={e => setPushAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                required>
                <option value="">Select an agent...</option>
                {filteredAgents.map((a, i) => (
                  <option key={i} value={a.uuid}>{a.name} ({a.location}) - {a.status}</option>
                ))}
              </select>
              {selectedCustomer && filteredAgents.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No agents found for selected customer</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Requested By</label>
              <input type="text" value={pushRequestedBy} onChange={e => setPushRequestedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Your name" />
            </div>
            {pushError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">{pushError}</div>}
            {pushSuccess && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">{pushSuccess}</div>}
            <button type="submit" disabled={pushLoading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              <Send className="h-4 w-4" />
              {pushLoading ? 'Pushing...' : 'Push to Agent'}
            </button>
          </form>
        </div>
      </div>

      {/* Pending Agent Downloads */}
      <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Download className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Pending Agent Downloads</h2>
            {pickups.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                {pickups.length}
              </span>
            )}
            {pickups.some(p => p.status === 'downloading') && (
              <span className="ml-1 flex items-center gap-1 text-xs text-blue-600 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                Downloading…
              </span>
            )}
          </div>
          <button onClick={fetchPickups}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
            <RefreshCw className={`h-4 w-4 ${pickupsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {pickupsLoading && pickups.length === 0 ? (
          <div className="text-center py-8 text-gray-600">Loading...</div>
        ) : pickups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No pending downloads</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">File</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Version</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Size</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Agent</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPickups.map((pickup, i) => (
                    <tr key={`pickup-${pickup.id}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{pickup.file_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="flex items-center gap-1 text-gray-700">
                          {pickup.file_type === 'script' ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                          <span className="capitalize">{pickup.file_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{pickup.version}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatFileSize((pickup as any).file_size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{pickup.agent_name || pickup.agent_uuid}</td>
                      <td className="px-4 py-3 text-sm min-w-[160px]">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusBadge(pickup.status)}`}>
                          {pickup.status === 'downloading' ? 'Downloading…' : pickup.status}
                        </span>

                        {/* Download progress bar */}
                        {pickup.status === 'downloading' && (
                          <div className="mt-2 space-y-1">
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              {/* Animated shimmer bar — indeterminate since we poll status only */}
                              <div className="h-full rounded-full bg-blue-400"
                                style={{
                                  width: '100%',
                                  backgroundImage: 'linear-gradient(90deg, #60a5fa 25%, #93c5fd 50%, #60a5fa 75%)',
                                  backgroundSize: '200% 100%',
                                  animation: 'shimmer 1.4s infinite linear',
                                }} />
                            </div>
                            <p className="text-xs text-blue-600">
                              Agent is downloading
                              {(pickup as any).file_size_bytes
                                ? ` · ${formatFileSize((pickup as any).file_size_bytes)}`
                                : ''}
                            </p>
                          </div>
                        )}

                        {pickup.status === 'failed' && pickup.error_message && (
                          <p className="text-xs text-red-600 mt-1 max-w-xs break-words" title={pickup.error_message}>
                            {pickup.error_message.length > 80
                              ? pickup.error_message.slice(0, 80) + '…'
                              : pickup.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(pickup.requested_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pickupsPage} totalPages={pickupsTotalPages}
              onPage={p => setPickupsPage(p)} />
            <p className="text-xs text-gray-400 mt-2">
              Showing {Math.min((pickupsPage - 1) * PICKUPS_PAGE_SIZE + 1, pickups.length)}–
              {Math.min(pickupsPage * PICKUPS_PAGE_SIZE, pickups.length)} of {pickups.length}
            </p>
          </>
        )}
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Uploaded Files */}
      <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">Uploaded Files</h2>
            {allFiles.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                {allFiles.length}
              </span>
            )}
          </div>
          <button onClick={fetchAllFiles}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
            <RefreshCw className={`h-4 w-4 ${allFilesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {allFilesLoading && allFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-600">Loading files...</div>
        ) : allFiles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No files uploaded yet</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">File Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Version</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Size</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Uploaded</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedFiles.map((file, i) => (
                    <tr key={`file-${file.id}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{file.file_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="flex items-center gap-1 text-gray-700">
                          {file.file_type === 'script' ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                          <span className="capitalize">{file.file_type}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{file.version}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatFileSize(file.file_size_bytes)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(file.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setSelectedHistoryFile(file); setShowHistoryModal(true); }}
                            className="text-blue-600 hover:text-blue-700 transition-colors" title="View transfer history">
                            <History className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeleteFile(file.id)}
                            className="text-red-600 hover:text-red-700 transition-colors" title="Delete file">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={allFilesPage} totalPages={filesTotalPages}
              onPage={p => setAllFilesPage(p)} />
            <p className="text-xs text-gray-400 mt-2">
              Showing {Math.min((allFilesPage - 1) * FILES_PAGE_SIZE + 1, allFiles.length)}–
              {Math.min(allFilesPage * FILES_PAGE_SIZE, allFiles.length)} of {allFiles.length}
            </p>
          </>
        )}
      </div>

      {selectedHistoryFile && (
        <TransferHistoryModal
          isOpen={showHistoryModal}
          onClose={() => { setShowHistoryModal(false); setSelectedHistoryFile(null); }}
          fileId={selectedHistoryFile.id}
          fileName={selectedHistoryFile.file_name}
        />
      )}
    </div>
  );
}
