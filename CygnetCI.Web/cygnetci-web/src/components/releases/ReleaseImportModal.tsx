'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileJson, ChevronDown, Info } from 'lucide-react';
import { CONFIG } from '@/lib/config';
import { apiService } from '@/lib/api/apiService';

interface ImportedRelease {
  name: string;
  description?: string;
  version?: string;
  type: 'pipeline_based' | 'environment_based';
  pipelines?: Array<{
    pipeline_name: string;
    order_index: number;
    execution_mode: 'sequential' | 'parallel';
    position_x: number;
    position_y: number;
  }>;
  stages?: Array<{
    environment_name: string;
    order_index: number;
    pre_deployment_approval: boolean;
    post_deployment_approval: boolean;
    auto_deploy: boolean;
  }>;
}

interface ImportFile {
  cygnetci_version: number;
  type: string;
  releases: ImportedRelease[];
}

interface Customer { id: number; display_name: string; }
interface PipelineRef { id: number; name: string; }
interface EnvRef { id: number; name: string; }

export function ReleaseImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<ImportFile | null>(null);
  const [parseError, setParseError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerPipelines, setCustomerPipelines] = useState<PipelineRef[]>([]);
  const [environments, setEnvironments] = useState<EnvRef[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string; warnings: string[] }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseFile = async (f: File) => {
    setParseError('');
    try {
      const text = await f.text();
      const json = JSON.parse(text) as ImportFile;
      if (!Array.isArray(json.releases) || json.releases.length === 0) {
        setParseError('No releases found in this file.'); return;
      }
      if (json.cygnetci_version !== 1) {
        setParseError('Unsupported export version.'); return;
      }
      setFile(json);
      const c = await apiService.getCustomers();
      setCustomers(c);
      setStep('preview');
    } catch {
      setParseError('Cannot parse file — make sure it is a CygnetCI release export.');
    }
  };

  useEffect(() => {
    if (!customerId) { setCustomerPipelines([]); setEnvironments([]); return; }
    setLoadingRefs(true);
    Promise.all([
      fetch(`${CONFIG.api.baseUrl}/pipelines?customer_id=${customerId}`, { headers: CONFIG.api.headers }).then(r => r.ok ? r.json() : []),
      fetch(`${CONFIG.api.baseUrl}/environments`, { headers: CONFIG.api.headers }).then(r => r.ok ? r.json() : []),
    ]).then(([pipes, envs]) => {
      setCustomerPipelines(pipes);
      setEnvironments(envs);
    }).finally(() => setLoadingRefs(false));
  }, [customerId]);

  const resolveRefs = (release: ImportedRelease) => {
    const warnings: string[] = [];
    let resolvedPipelines: any[] = [];
    let resolvedStages: any[] = [];

    if (release.type === 'pipeline_based' && release.pipelines) {
      resolvedPipelines = release.pipelines.map(rp => {
        const found = customerPipelines.find(p => p.name === rp.pipeline_name);
        if (!found) warnings.push(`Pipeline "${rp.pipeline_name}" not found — skipped`);
        return found ? { pipeline_id: found.id, order_index: rp.order_index, execution_mode: rp.execution_mode, position_x: rp.position_x, position_y: rp.position_y } : null;
      }).filter(Boolean);
    }

    if (release.type === 'environment_based' && release.stages) {
      resolvedStages = release.stages.map(s => {
        const found = environments.find(e => e.name === s.environment_name);
        if (!found) warnings.push(`Environment "${s.environment_name}" not found — skipped`);
        return found ? { environment_id: found.id, order_index: s.order_index, pre_deployment_approval: s.pre_deployment_approval, post_deployment_approval: s.post_deployment_approval, auto_deploy: s.auto_deploy } : null;
      }).filter(Boolean);
    }

    return { resolvedPipelines, resolvedStages, warnings };
  };

  const getPreviewWarnings = (release: ImportedRelease): string[] => {
    if (!customerId || loadingRefs) return [];
    return resolveRefs(release).warnings;
  };

  const handleImport = async () => {
    if (!customerId || !file) return;
    setImporting(true);
    const res: { name: string; ok: boolean; error?: string; warnings: string[] }[] = [];

    for (const r of file.releases) {
      const { resolvedPipelines, resolvedStages, warnings } = resolveRefs(r);
      try {
        await apiService.createRelease({
          name: r.name,
          description: r.description ?? '',
          version: r.version ?? '',
          customer_id: Number(customerId),
          pipelines: r.type === 'pipeline_based' ? resolvedPipelines : undefined,
          stages: r.type === 'environment_based' ? resolvedStages : undefined,
        });
        res.push({ name: r.name, ok: true, warnings });
      } catch (err: any) {
        res.push({ name: r.name, ok: false, error: err.message, warnings });
      }
    }

    setResults(res);
    setImporting(false);
    setStep('done');
    if (res.every(r => r.ok && r.warnings.length === 0)) setTimeout(onImported, 600);
  };

  const okCount = results.filter(r => r.ok).length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" /> Import Releases
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
                <p className="text-sm font-medium text-gray-700">Drop a CygnetCI release export here</p>
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
                <strong>{file.releases.length}</strong> release{file.releases.length !== 1 ? 's' : ''} ready to import.
                {' '}Pipeline and environment references are matched by name.
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

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {file.releases.map((r, i) => {
                  const warnings = getPreviewWarnings(r);
                  const refs = r.type === 'pipeline_based' ? r.pipelines : r.stages;
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{r.name}</p>
                          <p className="text-xs text-gray-400">
                            {r.type === 'pipeline_based' ? 'Pipeline-Based' : 'Environment-Based'}
                            {r.version ? ` · v${r.version}` : ''}
                            {' · '}{refs?.length ?? 0} {r.type === 'pipeline_based' ? 'pipeline(s)' : 'stage(s)'}
                          </p>
                        </div>
                        {loadingRefs && customerId && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 flex-shrink-0 mt-1" />}
                      </div>
                      {warnings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {warnings.map((w, j) => (
                            <p key={j} className="text-xs text-amber-600 flex items-start gap-1">
                              <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />{w}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setStep('upload')} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Back</button>
                <button onClick={handleImport} disabled={!customerId || importing || loadingRefs}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import {file.releases.length} Release{file.releases.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className={`rounded-lg px-4 py-3 text-sm font-medium ${okCount === results.length ? 'bg-green-50 text-green-800' : okCount === 0 ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'}`}>
                {okCount} of {results.length} release{results.length !== 1 ? 's' : ''} imported successfully.
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.ok ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                      <span className="text-sm text-gray-900 flex-1">{r.name}</span>
                      {r.error && <span className="text-xs text-red-500 truncate max-w-[200px]">{r.error}</span>}
                    </div>
                    {r.warnings.map((w, j) => (
                      <p key={j} className="mt-1 ml-7 text-xs text-amber-600 flex items-start gap-1">
                        <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />{w}
                      </p>
                    ))}
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
