// src/app/transfer/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Upload, Send, FileText, Package, Trash2, RefreshCw, Download, History } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';
import type { TransferFile, TransferFilePickup } from '@/types';
import { TransferHistoryModal } from '@/components/transfer/TransferHistoryModal';

export default function TransferPage() {
  // Upload Section State
  const [uploadFileType, setUploadFileType] = useState<'script' | 'artifact'>('script');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Push Section State
  const [files, setFiles] = useState<TransferFile[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
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
  const [pickups, setPickups] = useState<TransferFilePickup[]>([]);
  const [pickupsLoading, setPickupsLoading] = useState(false);

  // History Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedHistoryFile, setSelectedHistoryFile] = useState<TransferFile | null>(null);

  // Manual initial load on mount - load essential data
  useEffect(() => {
    fetchVersions();
    fetchAgents();
    fetchPickups();
  }, []);

  // When push file type or version changes, refresh file list
  useEffect(() => {
    if (pushFileType || pushVersion) {
      fetchFiles();
    }
  }, [pushFileType, pushVersion]);

  const fetchFiles = async () => {
    try {
      setFilesLoading(true);
      const data = await apiService.getTransferFiles(pushFileType, pushVersion);
      setFiles(data);
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setFilesLoading(false);
    }
  };

  const fetchVersions = async () => {
    try {
      const data = await apiService.getVersions();
      setVersions(data);
    } catch (err) {
      console.error('Failed to fetch versions:', err);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await apiService.getAgents();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const fetchPickups = async () => {
    try {
      setPickupsLoading(true);
      const data = await apiService.getPickups();
      setPickups(data);
    } catch (err) {
      console.error('Failed to fetch pickups:', err);
    } finally {
      setPickupsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);

    if (!selectedFile) {
      setUploadError('Please select a file');
      return;
    }

    if (!uploadVersion.trim()) {
      setUploadError('Please enter a version');
      return;
    }

    try {
      setUploadLoading(true);

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('file_type', uploadFileType);
      formData.append('version', uploadVersion.trim());
      if (uploadedBy.trim()) formData.append('uploaded_by', uploadedBy.trim());
      if (description.trim()) formData.append('description', description.trim());

      const result = await apiService.uploadFile(formData);

      setUploadSuccess(`File uploaded successfully: ${result.file.file_name}`);
      // Reset form
      setSelectedFile(null);
      setUploadVersion('');
      setDescription('');
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      // Auto-refresh files list to show the newly uploaded file
      fetchFiles();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload file');
    } finally {
      setUploadLoading(false);
    }
  };

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    setPushError(null);
    setPushSuccess(null);

    if (!pushFile) {
      setPushError('Please select a file');
      return;
    }

    if (!pushAgent) {
      setPushError('Please select an agent');
      return;
    }

    try {
      setPushLoading(true);

      const selectedAgent = agents.find(a => a.uuid === pushAgent);

      const result = await apiService.pushFileToAgent({
        transfer_file_id: parseInt(pushFile),
        agent_uuid: pushAgent,
        agent_name: selectedAgent?.name,
        requested_by: pushRequestedBy.trim() || undefined
      });

      setPushSuccess(`File pushed to agent successfully!`);
      // Reset form
      setPushFile('');
      setPushAgent('');
      setPushRequestedBy('');

      // Auto-refresh pickups to show the newly pushed file
      fetchPickups();
    } catch (err: any) {
      setPushError(err.message || 'Failed to push file');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      await apiService.deleteTransferFile(fileId);
      // Manually refresh the files list after delete
      await fetchFiles();
    } catch (err) {
      alert('Failed to delete file');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'downloaded': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

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
            {/* File Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="script"
                    checked={uploadFileType === 'script'}
                    onChange={(e) => setUploadFileType(e.target.value as 'script')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <FileText className="h-4 w-4" />
                  <span className="text-gray-700">Script</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="artifact"
                    checked={uploadFileType === 'artifact'}
                    onChange={(e) => setUploadFileType(e.target.value as 'artifact')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <Package className="h-4 w-4" />
                  <span className="text-gray-700">Artifact</span>
                </label>
              </div>
            </div>

            {/* Version */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={uploadVersion}
                onChange={(e) => setUploadVersion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="v1.0.0"
                required
              />
            </div>

            {/* File Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File <span className="text-red-500">*</span>
              </label>
              <input
                id="file-input"
                type="file"
                onChange={handleFileSelect}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                required
              />
              {selectedFile && (
                <p className="text-xs text-gray-500 mt-1">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            {/* Uploaded By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Uploaded By
              </label>
              <input
                type="text"
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Your name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Optional description"
                rows={2}
              />
            </div>

            {/* Messages */}
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {uploadError}
              </div>
            )}
            {uploadSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                {uploadSuccess}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={uploadLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadLoading ? 'Uploading...' : 'Upload File'}
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
            {/* File Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="script"
                    checked={pushFileType === 'script'}
                    onChange={(e) => setPushFileType(e.target.value as 'script')}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <FileText className="h-4 w-4" />
                  <span className="text-gray-700">Script</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="artifact"
                    checked={pushFileType === 'artifact'}
                    onChange={(e) => setPushFileType(e.target.value as 'artifact')}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <Package className="h-4 w-4" />
                  <span className="text-gray-700">Artifact</span>
                </label>
              </div>
            </div>

            {/* Version Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Version
              </label>
              <select
                value={pushVersion}
                onChange={(e) => {
                  setPushVersion(e.target.value);
                  setPushFile(''); // Reset file selection when version changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
              >
                <option value="">All Versions</option>
                {versions && versions.map((version, index) => (
                  <option key={`version-${version}-${index}`} value={version}>{version}</option>
                ))}
              </select>
            </div>

            {/* File Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File <span className="text-red-500">*</span>
              </label>
              <select
                value={pushFile}
                onChange={(e) => setPushFile(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                required
                disabled={filesLoading}
              >
                <option value="">Select a file...</option>
                {files && files.map((file, index) => (
                  <option key={`file-${file.id}-${index}`} value={file.id}>
                    {file.file_name} (v{file.version}) - {formatFileSize(file.file_size_bytes)}
                  </option>
                ))}
              </select>
              {filesLoading && (
                <p className="text-xs text-gray-500 mt-1">Loading files...</p>
              )}
            </div>

            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Agent <span className="text-red-500">*</span>
              </label>
              <select
                value={pushAgent}
                onChange={(e) => setPushAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                required
              >
                <option value="">Select an agent...</option>
                {agents && agents.map((agent, index) => (
                  <option key={`agent-${agent.uuid}-${index}`} value={agent.uuid}>
                    {agent.name} ({agent.location}) - {agent.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Requested By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Requested By
              </label>
              <input
                type="text"
                value={pushRequestedBy}
                onChange={(e) => setPushRequestedBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-gray-900 bg-white"
                placeholder="Your name"
              />
            </div>

            {/* Messages */}
            {pushError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {pushError}
              </div>
            )}
            {pushSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                {pushSuccess}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={pushLoading}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              {pushLoading ? 'Pushing...' : 'Push to Agent'}
            </button>
          </form>
        </div>
      </div>

      {/* Pending Pickups Section */}
      <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Download className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Pending Agent Downloads</h2>
          </div>
          <button
            onClick={fetchPickups}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {pickupsLoading ? (
          <div className="text-center py-8 text-gray-600">Loading pickups...</div>
        ) : pickups.length === 0 ? (
          <div className="text-center py-8 text-gray-600">No pending downloads</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">File</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Version</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Agent</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Requested</th>
                </tr>
              </thead>
              <tbody>
                {pickups && pickups.map((pickup, index) => (
                  <tr key={`pickup-${pickup.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{pickup.file_name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="flex items-center gap-1 text-gray-700">
                        {pickup.file_type === 'script' ? <FileText className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        <span className="capitalize">{pickup.file_type}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{pickup.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{pickup.agent_name || pickup.agent_uuid}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(pickup.status)}`}>
                        {pickup.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(pickup.requested_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Uploaded Files Section */}
      <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Uploaded Files</h2>
          <button
            onClick={fetchFiles}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {filesLoading ? (
          <div className="text-center py-8 text-gray-600">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-gray-600">No files uploaded yet</div>
        ) : (
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
                {files && files.map((file, index) => (
                  <tr key={`file-table-${file.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
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
                        <button
                          onClick={() => {
                            setSelectedHistoryFile(file);
                            setShowHistoryModal(true);
                          }}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="View transfer history"
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Delete file"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transfer History Modal */}
      {selectedHistoryFile && (
        <TransferHistoryModal
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedHistoryFile(null);
          }}
          fileId={selectedHistoryFile.id}
          fileName={selectedHistoryFile.file_name}
        />
      )}
    </div>
  );
}
