// src/components/monitoring/ServiceLogsModal.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, RefreshCw, FileText, ArrowLeft, AlertCircle, FolderOpen, Clock, HardDrive } from 'lucide-react';
import { CONFIG } from '@/lib/config';

interface LogFile {
  name: string;
  size_bytes: number;
  modified: string;
}

interface LogFilesResult {
  logs_dir: string;
  files: LogFile[];
}

interface LogReadResult {
  file_name: string;
  logs_dir: string;
  content: string;
  truncated: boolean;
  total_bytes: number;
}

type Phase = 'scanning' | 'files' | 'viewing' | 'error';

interface ServiceLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  serviceName: string;
  serviceDisplayName: string;
}

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30000;

/** Waits for a command to reach completed/failed status. Returns the result message string. */
async function waitForCommand(commandId: number, apiBase: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${apiBase}/commands/${commandId}`);
    if (!res.ok) throw new Error('Failed to poll command');
    const data = await res.json();
    if (data.status === 'completed') {
      return data.result?.message ?? 'ok';
    }
    if (data.status === 'failed') {
      throw new Error(data.result?.message ?? 'Command failed');
    }
  }
  throw new Error('Timed out waiting for agent response');
}

/** Polls the dedicated file-content endpoint until the agent has pushed the content. */
async function fetchFileContent(
  agentUuid: string,
  serviceName: string,
  fileName: string,
  apiBase: string
): Promise<LogReadResult> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(
      `${apiBase}/agents/service-log-content?service_name=${encodeURIComponent(serviceName)}&file_name=${encodeURIComponent(fileName)}`,
      { headers: { 'X-Agent-UUID': agentUuid } }
    );
    if (res.status === 404) continue; // not ready yet
    if (!res.ok) throw new Error(`Failed to fetch file content: ${res.statusText}`);
    return res.json();
  }
  throw new Error('Timed out waiting for file content');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export const ServiceLogsModal: React.FC<ServiceLogsModalProps> = ({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  serviceName,
  serviceDisplayName,
}) => {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [errorMessage, setErrorMessage] = useState('');
  const [logFiles, setLogFiles] = useState<LogFilesResult | null>(null);
  const [viewedFile, setViewedFile] = useState<LogReadResult | null>(null);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);

  const apiBase = CONFIG.api.baseUrl;

  const scanLogFiles = useCallback(async () => {
    setPhase('scanning');
    setErrorMessage('');
    setLogFiles(null);
    setViewedFile(null);
    try {
      // Issue command
      const res = await fetch(
        `${apiBase}/monitoring/agents/service-log-files/${encodeURIComponent(serviceName)}`,
        { method: 'POST', headers: { 'X-Agent-UUID': agentUuid } }
      );
      if (!res.ok) throw new Error('Failed to issue command');
      const { command_id } = await res.json();

      // Wait for agent to complete and parse the file list from the command result
      const msg = await waitForCommand(command_id, apiBase);
      let result: LogFilesResult;
      try {
        result = JSON.parse(msg);
      } catch {
        setErrorMessage(`Unexpected response: ${msg}`);
        setPhase('error');
        return;
      }
      setLogFiles(result);
      setPhase('files');
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Unknown error');
      setPhase('error');
    }
  }, [agentUuid, serviceName, apiBase]);

  const readFileViaAgent = async (fileName: string, maxKb: number): Promise<LogReadResult> => {
    // 1. Issue service_log_read command (tells agent which file to read)
    const res = await fetch(
      `${apiBase}/monitoring/agents/service-log-read/${encodeURIComponent(serviceName)}?file_name=${encodeURIComponent(fileName)}&max_kb=${maxKb}`,
      { method: 'POST', headers: { 'X-Agent-UUID': agentUuid } }
    );
    if (!res.ok) throw new Error('Failed to issue read command');
    const { command_id } = await res.json();

    // 2. Wait for command to complete (agent signals "ready" — content is pushed separately)
    await waitForCommand(command_id, apiBase);

    // 3. Fetch the content from the dedicated endpoint (agent already pushed it there)
    return fetchFileContent(agentUuid, serviceName, fileName, apiBase);
  };

  const viewFile = async (fileName: string) => {
    setLoadingFile(fileName);
    try {
      const result = await readFileViaAgent(fileName, 512);
      setViewedFile(result);
      setPhase('viewing');
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Unknown error');
      setPhase('error');
    } finally {
      setLoadingFile(null);
    }
  };

  const downloadFile = async (fileName: string) => {
    setLoadingFile(fileName + '_dl');
    try {
      const result = await readFileViaAgent(fileName, 4096);
      const blob = new Blob([result.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMessage(err.message ?? 'Unknown error');
      setPhase('error');
    } finally {
      setLoadingFile(null);
    }
  };

  const downloadViewed = () => {
    if (!viewedFile) return;
    const blob = new Blob([viewedFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = viewedFile.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isOpen) {
      scanLogFiles();
    }
  }, [isOpen, agentUuid, serviceName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {phase === 'viewing' && (
              <button
                onClick={() => setPhase('files')}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                title="Back to file list"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">{serviceDisplayName}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {phase === 'viewing' && viewedFile
                  ? viewedFile.file_name
                  : `Log Files — Agent: ${agentName}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'files' && (
              <button
                onClick={scanLogFiles}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                title="Refresh file list"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            {phase === 'viewing' && viewedFile && (
              <button
                onClick={downloadViewed}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* SCANNING */}
          {phase === 'scanning' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
              <RefreshCw className="h-10 w-10 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="font-medium text-gray-700">Scanning service directory...</p>
                <p className="text-sm mt-1">Agent is locating log files for <span className="font-mono">{serviceName}</span></p>
              </div>
            </div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <p className="font-semibold text-gray-800 text-lg">Could not retrieve log files</p>
                <p className="text-sm text-gray-600 mt-2 max-w-md font-mono bg-red-50 p-3 rounded-lg border border-red-200">{errorMessage}</p>
              </div>
              <button
                onClick={scanLogFiles}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          )}

          {/* FILE LIST */}
          {phase === 'files' && logFiles && (
            <div className="flex-1 overflow-y-auto">
              {/* Directory info bar */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-xs text-gray-500">
                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                <span className="font-mono truncate">{logFiles.logs_dir}</span>
              </div>

              {logFiles.files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
                  <FileText className="h-12 w-12" />
                  <div className="text-center">
                    <p className="font-medium">No log files found</p>
                    <p className="text-sm mt-1">No .log or .txt files in the service directory</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {logFiles.files.map((file) => {
                    const isViewLoading = loadingFile === file.name;
                    const isDlLoading = loadingFile === file.name + '_dl';
                    return (
                      <div
                        key={file.name}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                      >
                        <FileText className="h-5 w-5 text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">{file.name}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3" />
                              {formatBytes(file.size_bytes)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(file.modified)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => viewFile(file.name)}
                            disabled={!!loadingFile}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs transition-colors disabled:opacity-50"
                          >
                            {isViewLoading ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FileText className="h-3.5 w-3.5" />
                            )}
                            View
                          </button>
                          <button
                            onClick={() => downloadFile(file.name)}
                            disabled={!!loadingFile}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-xs transition-colors disabled:opacity-50"
                          >
                            {isDlLoading ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* FILE CONTENT VIEWER */}
          {phase === 'viewing' && viewedFile && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {viewedFile.truncated && (
                <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Showing last 512 KB of {formatBytes(viewedFile.total_bytes)} file. Download for full content.
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap break-words leading-5">
                  {viewedFile.content || '(empty file)'}
                </pre>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        {(phase === 'files' || phase === 'error') && (
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {phase === 'files' && logFiles
                ? `${logFiles.files.length} file${logFiles.files.length !== 1 ? 's' : ''} found`
                : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};