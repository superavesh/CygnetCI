'use client';

import React, { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileJson, ChevronDown } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';

interface ImportedPipeline {
  name: string;
  description?: string;
  branch?: string;
  steps?: Array<{ name: string; command: string; order: number; shellType: string }>;
  parameters?: Array<{ name: string; type: string; defaultValue: string; required: boolean; description: string; choices: string[] }>;
}

interface ImportFile {
  cygnetci_version: number;
  type: string;
  pipelines: ImportedPipeline[];
}

interface Customer { id: number; display_name: string; }

export function PipelineImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<ImportFile | null>(null);
  const [parseError, setParseError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (f: File) => {
    setParseError('');
    try {
      const text = await f.text();
      const json = JSON.parse(text) as ImportFile;
      if (!Array.isArray(json.pipelines) || json.pipelines.length === 0) {
        setParseError('No pipelines found in this file.'); return;
      }
      if (json.cygnetci_version !== 1) {
        setParseError('Unsupported export version.'); return;
      }
      setFile(json);
      const c = await apiService.getCustomers();
      setCustomers(c);
      setStep('preview');
    } catch {
      setParseError('Cannot parse file — make sure it is a CygnetCI pipeline export.');
    }
  };

  const handleImport = async () => {
    if (!customerId || !file) return;
    setImporting(true);
    const res: { name: string; ok: boolean; error?: string }[] = [];
    for (const p of file.pipelines) {
      try {
        await apiService.createPipeline({
          name: p.name,
          description: p.description ?? '',
          branch: p.branch ?? '',
          agentId: null,
          customerId: Number(customerId),
          steps: p.steps ?? [],
          parameters: p.parameters ?? [],
        });
        res.push({ name: p.name, ok: true });
      } catch (err: any) {
        res.push({ name: p.name, ok: false, error: err.message });
      }
    }
    setResults(res);
    setImporting(false);
    setStep('done');
    if (res.every(r => r.ok)) setTimeout(onImported, 600);
  };

  const okCount = results.filter(r => r.ok).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" /> Import Pipelines
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {step === 'upload' && (
            <>
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
              >
                <FileJson className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">Drop a CygnetCI pipeline export here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse — .json files only</p>
                <input ref={inputRef} type="file" accept=".json" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              </div>
              {parseError && (
                <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4 flex-shrink-0" />{parseError}</p>
              )}
            </>
          )}

          {step === 'preview' && file && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
                <strong>{file.pipelines.length}</strong> pipeline{file.pipelines.length !== 1 ? 's' : ''} ready to import.
                {' '}Agent assignments will be blank — configure them after import.
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {file.pipelines.map((p, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <p className="text-sm font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      {p.steps?.length ?? 0} steps · {p.parameters?.length ?? 0} params
                      {p.branch ? ` · branch: ${p.branch}` : ''}
                    </p>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Target Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select customer…</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                  Back
                </button>
                <button onClick={handleImport} disabled={!customerId || importing}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import {file.pipelines.length} Pipeline{file.pipelines.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className={`rounded-lg px-4 py-3 text-sm font-medium ${okCount === results.length ? 'bg-green-50 text-green-800' : okCount === 0 ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'}`}>
                {okCount} of {results.length} pipeline{results.length !== 1 ? 's' : ''} imported successfully.
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    {r.ok
                      ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      : <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                    <span className="text-sm text-gray-900 flex-1">{r.name}</span>
                    {r.error && <span className="text-xs text-red-500 truncate max-w-[200px]">{r.error}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700">Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
