// src/app/rollback/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import {
  Upload, Database, FileText, RefreshCw, Trash2, Download,
  CheckCircle, XCircle, Clock, AlertCircle, Loader, FileDown
} from 'lucide-react';

interface RollbackScript {
  id: number;
  script_name: string;
  file_size_bytes: number;
  uploaded_by: string | null;
  description: string | null;
  analysis_status: 'pending' | 'analyzing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  object_count: number;
}

interface DatabaseObjects {
  [dbName: string]: {
    tables: string[];
    stored_procedures: string[];
    functions: string[];
    user_types: string[];
    table_types: string[];
    views: string[];
    triggers: string[];
    indexes: string[];
  };
}

interface ScriptDetails extends RollbackScript {
  file_path: string;
  checksum: string;
  analysis_result: any;
  database_objects: DatabaseObjects;
}

export default function RollbackPage() {
  const [scripts, setScripts] = useState<RollbackScript[]>([]);
  const [selectedScript, setSelectedScript] = useState<ScriptDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [uploadedBy, setUploadedBy] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Toast notification state
  const [toast, setToast] = useState<{show: boolean; message: string; type: 'success' | 'error' | 'info'} | null>(null);

  // Delete confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{show: boolean; scriptId: number; scriptName: string} | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/rollback/scripts');
      if (response.ok) {
        const data = await response.json();
        setScripts(data);
      }
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.sql')) {
        setSelectedFile(file);
      } else {
        showToast('Please upload a .sql file', 'error');
      }
    }
  };

  const handleBrowseClick = () => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) fileInput.click();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast('Please select a file', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (description) formData.append('description', description);
      if (uploadedBy) formData.append('uploaded_by', uploadedBy);

      const response = await fetch('http://127.0.0.1:8000/rollback/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        showToast('Script uploaded successfully!', 'success');
        setSelectedFile(null);
        setDescription('');
        setUploadedBy('');
        // Clear file input
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        await fetchScripts();
      } else {
        const error = await response.json();
        showToast(`Upload failed: ${error.detail}`, 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showToast('Failed to upload script', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (scriptId: number) => {
    setAnalyzing(scriptId);
    try {
      const response = await fetch(`http://127.0.0.1:8000/rollback/${scriptId}/analyze`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        showToast('Script analyzed successfully!', 'success');
        await fetchScripts();
      } else {
        const error = await response.json();
        showToast(`Analysis failed: ${error.detail}`, 'error');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      showToast('Failed to analyze script', 'error');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleViewDetails = async (scriptId: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/rollback/${scriptId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedScript(data);
        setShowDetails(true);
      }
    } catch (error) {
      console.error('Failed to fetch script details:', error);
    }
  };

  const handleDeleteClick = (scriptId: number, scriptName: string) => {
    setDeleteConfirmation({ show: true, scriptId, scriptName });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;

    const scriptId = deleteConfirmation.scriptId;
    setDeleteConfirmation(null);

    try {
      const response = await fetch(`http://127.0.0.1:8000/rollback/${scriptId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        showToast('Script deleted successfully!', 'success');
        await fetchScripts();
        if (selectedScript?.id === scriptId) {
          setShowDetails(false);
          setSelectedScript(null);
        }
      } else {
        const error = await response.json();
        showToast(`Delete failed: ${error.detail}`, 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete script', 'error');
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation(null);
  };

  const handleDownload = (scriptId: number) => {
    window.open(`http://127.0.0.1:8000/rollback/${scriptId}/download`, '_blank');
  };

  const handleDownloadResultsJSON = () => {
    if (!selectedScript) return;

    const analysisData = {
      script_name: selectedScript.script_name,
      uploaded_by: selectedScript.uploaded_by,
      uploaded_at: selectedScript.created_at,
      analyzed_at: selectedScript.updated_at,
      total_objects: selectedScript.object_count,
      database_objects: selectedScript.database_objects,
      raw_analysis: selectedScript.analysis_result
    };

    const blob = new Blob([JSON.stringify(analysisData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedScript.script_name.replace('.sql', '')}_analysis.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('JSON results downloaded successfully!', 'success');
  };

  const handleDownloadResultsCSV = () => {
    if (!selectedScript) return;

    // Create CSV content
    let csvContent = 'Database,Object Type,Object Name\n';

    Object.entries(selectedScript.database_objects).forEach(([dbName, objects]) => {
      const db = dbName || 'Default';

      objects.tables.forEach(name => csvContent += `"${db}","Table","${name}"\n`);
      objects.stored_procedures.forEach(name => csvContent += `"${db}","Stored Procedure","${name}"\n`);
      objects.functions.forEach(name => csvContent += `"${db}","Function","${name}"\n`);
      objects.views.forEach(name => csvContent += `"${db}","View","${name}"\n`);
      objects.triggers.forEach(name => csvContent += `"${db}","Trigger","${name}"\n`);
      objects.indexes.forEach(name => csvContent += `"${db}","Index","${name}"\n`);
      objects.user_types.forEach(name => csvContent += `"${db}","User Type","${name}"\n`);
      objects.table_types.forEach(name => csvContent += `"${db}","Table Type","${name}"\n`);
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedScript.script_name.replace('.sql', '')}_analysis.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('CSV results downloaded successfully!', 'success');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-[#FEB114]" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'analyzing':
        return <Loader className="h-5 w-5 text-[#FEB114] animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'analyzing':
        return 'bg-blue-100 text-[#FEB114]';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#081D2B] flex items-center gap-3">
              <Database className="h-8 w-8 text-[#FEB114]" />
              Database Rollback Scripts
            </h1>
            <p className="text-gray-600 mt-1">Upload and analyze SQL scripts with AI-powered object detection</p>
          </div>
          <button
            onClick={fetchScripts}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="h-5 w-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content Grid - Upload and Scripts Side by Side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Upload Section */}
        <div className="xl:col-span-1">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 h-full">
            <h2 className="text-xl font-semibold text-[#081D2B] mb-4 flex items-center gap-2">
              <Upload className="h-6 w-6 text-[#FEB114]" />
              Upload New Script
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SQL Script File (.sql)
                </label>

                {/* Hidden file input */}
                <input
                  id="fileInput"
                  type="file"
                  accept=".sql"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Drag and drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleBrowseClick}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-[#FEB114] bg-blue-50'
                      : selectedFile
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-orange-50'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    {selectedFile ? (
                      <>
                        <CheckCircle className="h-10 w-10 text-[#FEB114] mb-2" />
                        <p className="text-sm font-semibold text-[#081D2B] mb-1 truncate w-full">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-600 mb-2">
                          {formatFileSize(selectedFile.size)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Click to change
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-gray-400 mb-2" />
                        <p className="text-sm font-semibold text-[#081D2B] mb-1">
                          Drop SQL file here
                        </p>
                        <p className="text-xs text-gray-600 mb-1">
                          or click to browse
                        </p>
                        <p className="text-xs text-gray-500">
                          Up to 500MB
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter script description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FEB114] focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Uploaded By (Optional)
                </label>
                <input
                  type="text"
                  value={uploadedBy}
                  onChange={(e) => setUploadedBy(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FEB114] focus:border-transparent text-sm"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full px-4 py-2.5 bg-gradient-to-r from-[#FEB114] to-[#E59D00] hover:from-[#E59D00] hover:to-[#FEB114] text-[#081D2B] font-semibold rounded-lg shadow-md hover:shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
              >
                {uploading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Script
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Scripts List */}
        <div className="xl:col-span-2">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 h-full flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-xl font-semibold text-[#081D2B] flex items-center gap-2">
                <FileText className="h-6 w-6 text-[#FEB114]" />
                Uploaded Scripts ({scripts.length})
              </h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader className="h-8 w-8 animate-spin text-[#FEB114]" />
              </div>
            ) : scripts.length === 0 ? (
              <div className="text-center py-12">
                <Database className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-800 mb-2">No Scripts Found</h3>
                <p className="text-gray-600">Upload your first SQL script to get started</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Script Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Objects
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {scripts.map((script) => (
                  <tr key={script.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-[#081D2B]">{script.script_name}</div>
                          {script.description && (
                            <div className="text-sm text-gray-500">{script.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(script.file_size_bytes)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {script.uploaded_by || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(script.analysis_status)}
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(script.analysis_status)}`}>
                          {script.analysis_status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {script.object_count > 0 ? `${script.object_count} objects` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(script.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {(script.analysis_status === 'pending' || script.analysis_status === 'failed') && (
                        <button
                          onClick={() => handleAnalyze(script.id)}
                          disabled={analyzing === script.id}
                          className="text-[#FEB114] hover:text-[#E59D00] disabled:opacity-50"
                          title={script.analysis_status === 'failed' ? 'Retry Analysis' : 'Analyze with AI'}
                        >
                          {analyzing === script.id ? (
                            <Loader className="h-4 w-4 animate-spin inline" />
                          ) : script.analysis_status === 'failed' ? (
                            'Retry'
                          ) : (
                            'Analyze'
                          )}
                        </button>
                      )}
                      {script.analysis_status === 'completed' && (
                        <button
                          onClick={() => handleViewDetails(script.id)}
                          className="text-[#FEB114] hover:text-green-900"
                          title="View Details"
                        >
                          View Details
                        </button>
                      )}
                      <button
                        onClick={() => handleDownload(script.id)}
                        className="text-gray-600 hover:text-[#081D2B]"
                        title="Download"
                      >
                        <Download className="h-4 w-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(script.id, script.script_name)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {showDetails && selectedScript && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-[#081D2B]">{selectedScript.script_name}</h2>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Script Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">File Size</p>
                  <p className="text-lg font-semibold text-[#081D2B]">{formatFileSize(selectedScript.file_size_bytes)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Uploaded By</p>
                  <p className="text-lg font-semibold text-[#081D2B]">{selectedScript.uploaded_by || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className={`text-lg font-semibold ${selectedScript.analysis_status === 'completed' ? 'text-[#FEB114]' : 'text-[#081D2B]'}`}>
                    {selectedScript.analysis_status}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Objects</p>
                  <p className="text-lg font-semibold text-[#081D2B]">{selectedScript.object_count}</p>
                </div>
              </div>

              {/* Database Objects */}
              <div>
                <h3 className="text-lg font-semibold text-[#081D2B] mb-4">Identified Database Objects</h3>
                {Object.keys(selectedScript.database_objects).length === 0 ? (
                  <p className="text-gray-600">No objects identified</p>
                ) : (
                  Object.entries(selectedScript.database_objects).map(([dbName, objects]) => (
                    <div key={dbName} className="mb-6 bg-gray-50 rounded-lg p-4">
                      <h4 className="text-md font-semibold text-gray-800 mb-3">
                        Database: {dbName || '<Default>'}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {objects.tables.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Tables ({objects.tables.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.tables.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.stored_procedures.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Stored Procedures ({objects.stored_procedures.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.stored_procedures.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.functions.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Functions ({objects.functions.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.functions.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.views.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Views ({objects.views.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.views.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.triggers.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Triggers ({objects.triggers.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.triggers.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.indexes.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Indexes ({objects.indexes.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.indexes.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.user_types.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">User Types ({objects.user_types.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.user_types.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {objects.table_types.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Table Types ({objects.table_types.length})</p>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {objects.table_types.map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3 justify-between">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDownloadResultsJSON}
                  className="px-6 py-2 bg-gradient-to-r from-[#FEB114] to-[#E59D00] hover:from-[#E59D00] hover:to-[#FEB114] text-[#081D2B] font-semibold rounded-lg shadow-md hover:shadow-lg transition-colors flex items-center justify-center gap-2"
                  title="Download analysis results as JSON"
                >
                  <FileDown className="h-4 w-4" />
                  Download JSON
                </button>
                <button
                  onClick={handleDownloadResultsCSV}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  title="Download analysis results as CSV"
                >
                  <FileDown className="h-4 w-4" />
                  Download CSV
                </button>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="px-6 py-2 bg-[#0F2A3D] text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#081D2B]">Confirm Delete</h2>
                <p className="text-sm text-gray-600">This action cannot be undone</p>
              </div>
            </div>

            <div className="px-6 py-4">
              <p className="text-gray-700 mb-2">
                Are you sure you want to delete this script?
              </p>
              <p className="text-sm font-medium text-[#081D2B] bg-gray-50 px-3 py-2 rounded border border-gray-200">
                {deleteConfirmation.scriptName}
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
          <div className={`rounded-lg shadow-lg px-6 py-4 flex items-center gap-3 min-w-[300px] max-w-md ${
            toast.type === 'success' ? 'bg-green-50 border-l-4 border-green-500' :
            toast.type === 'error' ? 'bg-red-50 border-l-4 border-red-500' :
            'bg-blue-50 border-l-4 border-[#FEB114]'
          }`}>
            {toast.type === 'success' && <CheckCircle className="h-5 w-5 text-[#FEB114] flex-shrink-0" />}
            {toast.type === 'error' && <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />}
            {toast.type === 'info' && <AlertCircle className="h-5 w-5 text-[#FEB114] flex-shrink-0" />}
            <p className={`text-sm font-medium ${
              toast.type === 'success' ? 'text-green-800' :
              toast.type === 'error' ? 'text-red-800' :
              'text-[#FEB114]'
            }`}>
              {toast.message}
            </p>
            <button
              onClick={() => setToast(null)}
              className={`ml-auto flex-shrink-0 ${
                toast.type === 'success' ? 'text-[#FEB114] hover:text-green-800' :
                toast.type === 'error' ? 'text-red-600 hover:text-red-800' :
                'text-[#FEB114] hover:text-[#FEB114]'
              }`}
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
