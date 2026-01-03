# Release Pipelines Implementation Guide

## Overview
This guide documents the implementation needed to support pipeline-based releases (using `release_pipelines` table) instead of environment-based releases (`release_stages`).

**Current State**: The database has `release_pipelines` data with sequential/parallel execution modes, but the frontend and backend APIs use `release_stages`.

**Goal**: Implement full support for releases that execute multiple pipelines in sequential or parallel order.

---

## What's Been Completed ✅

### 1. TypeScript Types
**File**: `CygnetCI.Web/cygnetci-web/src/types/index.ts`

Added:
```typescript
export interface ReleasePipeline {
  id: number;
  release_id: number;
  pipeline_id: number;
  pipeline?: {
    id: number;
    name: string;
  };
  order_index: number;
  execution_mode: 'sequential' | 'parallel';
  depends_on?: number;
  position_x: number;
  position_y: number;
  created_at: string;
}

// Updated Release interface to include:
pipelines?: ReleasePipeline[];
```

### 2. Backend Model
**File**: `CygnetCI.Api/models.py`

Added `ReleasePipeline` model (lines 433-452):
```python
class ReleasePipeline(Base):
    __tablename__ = "release_pipelines"

    id = Column(Integer, primary_key=True, index=True)
    release_id = Column(Integer, ForeignKey("releases.id", ondelete="CASCADE"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)
    execution_mode = Column(String(50), default="sequential")
    depends_on = Column(Integer, ForeignKey("release_pipelines.id", ondelete="SET NULL"))
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    created_at = Column(TIMESTAMP, server_default=func.now())

    # Relationships
    release = relationship("Release", back_populates="pipelines")
    pipeline = relationship("Pipeline")

    __table_args__ = (
        CheckConstraint("execution_mode IN ('sequential', 'parallel')", name="check_execution_mode"),
    )
```

Updated `Release` model to include:
```python
pipelines = relationship("ReleasePipeline", back_populates="release", cascade="all, delete-orphan")
```

---

## What Needs to Be Done 🔨

### PHASE 1: Backend API Updates

#### 1.1 Update GET /releases Endpoint
**File**: `CygnetCI.Api/main.py` (around line 1558)

**Current code** only returns `stages`. Need to also fetch and return `pipelines`.

**Add after line 1568** (after fetching stages):
```python
# Get pipelines for this release
pipelines = db.query(models.ReleasePipeline)\
    .filter(models.ReleasePipeline.release_id == release.id)\
    .order_by(models.ReleasePipeline.order_index)\
    .all()
```

**Add to result dict** (after stages, around line 1596):
```python
"pipelines": [
    {
        "id": rp.id,
        "pipeline_id": rp.pipeline_id,
        "order_index": rp.order_index,
        "execution_mode": rp.execution_mode,
        "depends_on": rp.depends_on,
        "position_x": rp.position_x,
        "position_y": rp.position_y,
        "pipeline": {
            "id": rp.pipeline.id,
            "name": rp.pipeline.name
        } if rp.pipeline else None
    }
    for rp in pipelines
],
```

#### 1.2 Update POST /releases Endpoint
**File**: `CygnetCI.Api/main.py` (around line 1608)

**Add Pydantic model** for request validation (around line 1463, near other models):
```python
class ReleasePipelineCreate(BaseModel):
    pipeline_id: int
    order_index: int
    execution_mode: str = "sequential"
    depends_on: Optional[int] = None
    position_x: int = 0
    position_y: int = 0

class ReleaseCreate(BaseModel):
    name: str
    description: Optional[str] = None
    version: Optional[str] = None
    pipeline_id: Optional[int] = None
    customer_id: Optional[int] = None
    stages: List[ReleaseStageCreate] = []
    pipelines: List[ReleasePipelineCreate] = []  # ADD THIS LINE
```

**Update create_release function** (after line 1632, after creating stages):
```python
# Create pipelines
for pipeline_data in release.pipelines:
    db_pipeline = models.ReleasePipeline(
        release_id=db_release.id,
        pipeline_id=pipeline_data.pipeline_id,
        order_index=pipeline_data.order_index,
        execution_mode=pipeline_data.execution_mode,
        depends_on=pipeline_data.depends_on,
        position_x=pipeline_data.position_x,
        position_y=pipeline_data.position_y
    )
    db.add(db_pipeline)
```

#### 1.3 Create New Deploy Endpoint for Pipeline-Based Releases
**File**: `CygnetCI.Api/main.py`

**Add new endpoint** (around line 1850, after existing deploy_release):
```python
@app.post("/releases/{release_id}/deploy-pipelines", tags=["🌐 UI - Release Execution"])
def deploy_release_pipelines(release_id: int, request: DeployReleaseRequest, db: Session = Depends(get_db)):
    """Deploy a release by executing configured pipelines in sequential/parallel order"""
    release = db.query(models.Release).filter(models.Release.id == release_id).first()
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    # Get all pipelines for this release
    release_pipelines = db.query(models.ReleasePipeline)\
        .filter(models.ReleasePipeline.release_id == release_id)\
        .order_by(models.ReleasePipeline.order_index)\
        .all()

    if not release_pipelines:
        raise HTTPException(status_code=400, detail="Release has no pipelines configured")

    # Get agent information if provided
    agent = None
    if request.agent_id:
        agent = db.query(models.Agent).filter(models.Agent.id == request.agent_id).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")

    # Generate release number
    execution_count = db.query(models.ReleaseExecution)\
        .filter(models.ReleaseExecution.release_id == release_id)\
        .count()
    release_number = f"Release-{execution_count + 1}"

    # Create release execution
    release_execution = models.ReleaseExecution(
        release_id=release_id,
        release_number=release_number,
        triggered_by=request.triggered_by,
        status="in_progress",
        artifact_version=request.artifact_version,
        started_at=datetime.now()
    )
    db.add(release_execution)
    db.flush()

    # Store parameters
    if request.parameters:
        for param_name, param_value in request.parameters.items():
            exec_param = models.ReleaseExecutionParameter(
                release_execution_id=release_execution.id,
                parameter_name=param_name,
                parameter_value=str(param_value)
            )
            db.add(exec_param)

    # Create pipeline executions for each configured pipeline
    for rp in release_pipelines:
        pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == rp.pipeline_id).first()
        if not pipeline:
            continue

        # Create pipeline execution
        pipeline_execution = models.PipelineExecution(
            pipeline_id=rp.pipeline_id,
            status="pending",
            triggered_by=request.triggered_by,
            agent_id=agent.id if agent else None,
            agent_name=agent.name if agent else None,
            started_at=datetime.now() if rp.execution_mode == "sequential" and rp.order_index == 0 else None
        )
        db.add(pipeline_execution)
        db.flush()

        # Create pipeline pickup for agent to execute
        if agent:
            pickup = models.PipelinePickup(
                pipeline_id=rp.pipeline_id,
                pipeline_execution_id=pipeline_execution.id,
                agent_id=agent.id,
                agent_uuid=agent.uuid,
                agent_name=agent.name,
                status="pending",
                priority=0
            )
            db.add(pickup)

    db.commit()

    return {
        "success": True,
        "execution_id": release_execution.id,
        "release_number": release_number,
        "message": f"Release deployment started with {len(release_pipelines)} pipeline(s)"
    }
```

#### 1.4 Add Endpoint to Get Pipeline Execution Logs
**File**: `CygnetCI.Api/main.py`

**Add new endpoint**:
```python
@app.get("/pipeline-executions/{execution_id}/logs", tags=["🌐 UI - Pipeline Execution"])
def get_pipeline_execution_logs(execution_id: int, db: Session = Depends(get_db)):
    """Get logs for a pipeline execution"""
    logs = db.query(models.PipelineExecutionLog)\
        .filter(models.PipelineExecutionLog.pipeline_execution_id == execution_id)\
        .order_by(models.PipelineExecutionLog.timestamp)\
        .all()

    if not logs:
        return {"logs": "No logs available for this pipeline execution"}

    # Format logs as text
    log_text = "\n".join([
        f"[{log.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] [{log.log_level.upper()}] {log.message}"
        for log in logs
    ])

    return {"logs": log_text}
```

---

### PHASE 2: Frontend Updates

#### 2.1 Update API Service
**File**: `CygnetCI.Web/cygnetci-web/src/lib/api/apiService.ts`

**Add new method**:
```typescript
async deployReleasePipelines(releaseId: number, data: {
  triggered_by: string;
  artifact_version?: string;
  parameters?: Record<string, any>;
  agent_id?: number;
}): Promise<any> {
  if (!CONFIG.app.useRealAPI) {
    console.log(`Deploying release ${releaseId} (dummy mode)`);
    return { success: true, executionId: Date.now(), releaseNumber: 'Release-1' };
  }

  const url = `${CONFIG.api.baseUrl}/releases/${releaseId}/deploy-pipelines`;
  const response = await fetch(url, {
    method: 'POST',
    headers: CONFIG.api.headers,
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}

async getPipelineExecutionLogs(executionId: number): Promise<{ logs: string }> {
  if (!CONFIG.app.useRealAPI) {
    console.log(`Getting logs for pipeline execution ${executionId} (dummy mode)`);
    return { logs: 'Dummy logs - no real data available in dummy mode' };
  }

  const url = `${CONFIG.api.baseUrl}/pipeline-executions/${executionId}/logs`;
  const response = await fetch(url, {
    method: 'GET',
    headers: CONFIG.api.headers
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return await response.json();
}
```

#### 2.2 Update Releases Page to Show Pipelines
**File**: `CygnetCI.Web/cygnetci-web/src/app/releases/page.tsx`

**Replace Stages Timeline section** (lines 230-258) with **Pipelines Timeline**:
```typescript
{/* Pipelines Timeline */}
{release.pipelines && release.pipelines.length > 0 && (
  <div className="mb-4">
    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
      Configured Pipelines ({release.pipelines.length})
    </h4>
    <div className="flex items-center gap-2 flex-wrap">
      {release.pipelines
        .sort((a, b) => a.order_index - b.order_index)
        .map((rp, idx) => (
          <React.Fragment key={rp.id}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-md">
              <GitBranch className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">
                {rp.pipeline?.name || `Pipeline ${rp.pipeline_id}`}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                rp.execution_mode === 'sequential'
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-600 text-white'
              }`}>
                {rp.execution_mode === 'sequential' ? '→' : '⇉'}
              </span>
            </div>
            {idx < release.pipelines.length - 1 && rp.execution_mode === 'sequential' && (
              <ArrowRight className="h-4 w-4 text-gray-400" />
            )}
          </React.Fragment>
        ))}
    </div>
  </div>
)}
```

**Also show stages if they exist** (for backward compatibility):
```typescript
{/* Keep existing stages display for backward compatibility */}
{release.stages && release.stages.length > 0 && (
  <div className="mb-4">
    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
      Environment Stages (Legacy)
    </h4>
    {/* ... existing stages display code ... */}
  </div>
)}
```

#### 2.3 Update DeployReleaseModal
**File**: `CygnetCI.Web/cygnetci-web/src/components/releases/DeployReleaseModal.tsx`

**Update handleSubmit** (line 68) to check for pipelines vs stages:
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!triggeredBy.trim()) {
    setError('Please enter your name');
    return;
  }

  if (!selectedAgentId) {
    setError('Please select an agent to execute the deployment');
    return;
  }

  try {
    setLoading(true);
    setError(null);

    // Use pipeline-based deployment if release has pipelines
    if (release.pipelines && release.pipelines.length > 0) {
      await apiService.deployReleasePipelines(release.id, {
        triggered_by: triggeredBy.trim(),
        artifact_version: artifactVersion.trim() || undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        agent_id: selectedAgentId
      });
    } else {
      // Fallback to stage-based deployment for legacy releases
      await apiService.deployRelease(release.id, {
        triggered_by: triggeredBy.trim(),
        artifact_version: artifactVersion.trim() || undefined,
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        agent_id: selectedAgentId
      });
    }

    onSuccess();
  } catch (err) {
    setError('Failed to deploy release');
    console.error(err);
  } finally {
    setLoading(false);
  }
};
```

**Update Stages Preview** (line 131) to show pipelines:
```typescript
{/* Deployment Preview */}
<div className="space-y-3">
  <h3 className="text-sm font-semibold text-gray-700 uppercase">Deployment Preview</h3>
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
    {release.pipelines && release.pipelines.length > 0 ? (
      <>
        <p className="text-sm text-gray-700 mb-2">
          This release will execute {release.pipelines.length} pipeline(s):
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {release.pipelines
            .sort((a, b) => a.order_index - b.order_index)
            .map((rp, idx) => (
              <React.Fragment key={rp.id}>
                <div className="flex flex-col items-center">
                  <div className="px-4 py-2 rounded-lg border-2 bg-purple-50 border-purple-400">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-purple-600" />
                      <span className="text-sm font-medium text-gray-900">
                        {rp.pipeline?.name || `Pipeline ${rp.pipeline_id}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-600 mt-1">
                    {rp.execution_mode}
                  </span>
                </div>
                {idx < release.pipelines.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-gray-400" />
                )}
              </React.Fragment>
            ))}
        </div>
      </>
    ) : (
      <>
        {/* Existing stages preview for legacy releases */}
      </>
    )}
  </div>
</div>
```

#### 2.4 Create New CreateReleaseModal with Pipeline Support
**File**: `CygnetCI.Web/cygnetci-web/src/components/releases/CreateReleaseModal.tsx`

This is a major update. The modal needs to support BOTH approaches:
- Legacy: Environment stages
- New: Pipeline configuration with sequential/parallel modes

**Key changes**:
1. Add state for `releasePipelines`
2. Add UI to select multiple pipelines
3. Add execution mode toggle (sequential/parallel)
4. Add ordering controls
5. Submit both stages and pipelines to backend

**Simplified approach for now**: Add a toggle at the top to switch between "Environment-based" and "Pipeline-based" release creation.

---

### PHASE 3: View Logs Implementation

#### 3.1 Update ReleaseExecutionHistoryModal
**File**: `CygnetCI.Web/cygnetci-web/src/components/releases/ReleaseExecutionHistoryModal.tsx`

Currently shows stages. Need to also support showing pipeline executions.

**Add new section** to display pipeline executions if release uses pipelines:
```typescript
{/* Pipeline Executions (for pipeline-based releases) */}
{execution.pipeline_executions && execution.pipeline_executions.length > 0 && (
  <div className="pt-3 border-t border-gray-200">
    <span className="text-xs text-gray-500 font-medium mb-3 block">
      Pipeline Executions ({execution.pipeline_executions.length}):
    </span>
    <div className="flex items-start gap-3 flex-wrap">
      {execution.pipeline_executions.map((pe, idx) => (
        <React.Fragment key={pe.id}>
          <div className="flex flex-col gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${getStatusColor(pe.status)}`}>
              {getStatusIcon(pe.status)}
              <div className="flex-1">
                <span className="text-xs font-medium block">{pe.pipeline_name}</span>
                {pe.started_at && pe.completed_at && (
                  <span className="text-xs opacity-75">
                    {formatDuration(Math.floor((new Date(pe.completed_at).getTime() - new Date(pe.started_at).getTime()) / 1000))}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                // Open logs modal for pipeline execution
                setSelectedPipelineExecution({ id: pe.id, name: pe.pipeline_name });
                setShowPipelineLogsModal(true);
              }}
              className="px-3 py-2 text-white rounded-md transition-colors shadow-md flex items-center justify-center gap-2 font-medium text-xs"
              style={{
                background: 'linear-gradient(135deg, #1a365d, #2d4a73)',
                border: '1px solid #1a365d'
              }}
              title="View Pipeline Logs"
            >
              <Eye className="h-4 w-4" />
              <span>View Logs</span>
            </button>
          </div>
          {idx < execution.pipeline_executions.length - 1 && (
            <ArrowRight className="h-5 w-5 text-gray-400 mt-4" />
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
)}
```

#### 3.2 Create PipelineLogsModal Component
**File**: `CygnetCI.Web/cygnetci-web/src/components/releases/PipelineLogsModal.tsx`

Create new component similar to `ReleaseStageLogsModal.tsx` but for pipeline executions:
```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { X, Terminal, Download, RefreshCw } from 'lucide-react';
import { apiService } from '@/lib/api/apiService';

interface PipelineLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineExecutionId: number;
  pipelineName: string;
  releaseName: string;
}

export const PipelineLogsModal: React.FC<PipelineLogsModalProps> = ({
  isOpen,
  onClose,
  pipelineExecutionId,
  pipelineName,
  releaseName
}) => {
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetchLogs();
  }, [isOpen, pipelineExecutionId]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const logsData = await apiService.getPipelineExecutionLogs(pipelineExecutionId);
      setLogs(logsData.logs || 'No logs available');
    } catch (err) {
      console.error('Error fetching pipeline logs:', err);
      setError('Failed to fetch logs');
      setLogs('');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${releaseName}-${pipelineName}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Terminal className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Pipeline Execution Logs</h2>
              <p className="text-sm text-gray-500">{releaseName} - {pipelineName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="Refresh Logs"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleDownload}
              disabled={!logs || loading}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700 disabled:opacity-50"
              title="Download Logs"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Terminal-style log display */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto"></div>
              <p className="mt-4 text-green-400">Loading logs...</p>
            </div>
          )}

          {error && (
            <div className="text-red-400 font-mono text-sm">
              ERROR: {error}
            </div>
          )}

          {!loading && !error && (
            <pre className="text-sm font-mono text-green-400 whitespace-pre-wrap break-words">
              {logs}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">Pipeline Execution ID: {pipelineExecutionId}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Testing Plan

### 1. Test Existing Releases
Your existing releases (IDs 12-17) should work after backend updates:
- Deploy release 12 (has 3 pipelines: sequential, parallel, sequential)
- Verify all 3 pipelines are executed
- Check execution logs

### 2. Test Creating New Pipeline-Based Release
- Create new release with 2-3 pipelines
- Configure sequential/parallel execution modes
- Deploy and verify execution order

### 3. Test Backward Compatibility
- Legacy releases with only `stages` should still work
- UI should handle both types gracefully

---

## Summary of Changes

### Backend (Python/FastAPI)
1. ✅ Added `ReleasePipeline` model
2. ⏳ Update GET `/releases` to return pipelines
3. ⏳ Update POST `/releases` to accept pipelines
4. ⏳ Create POST `/releases/{id}/deploy-pipelines` endpoint
5. ⏳ Create GET `/pipeline-executions/{id}/logs` endpoint

### Frontend (Next.js/TypeScript)
1. ✅ Added `ReleasePipeline` TypeScript interface
2. ⏳ Update API service with new methods
3. ⏳ Update releases page to display pipelines
4. ⏳ Update DeployReleaseModal to use pipeline deployment
5. ⏳ Update CreateReleaseModal to support pipelines
6. ⏳ Update ReleaseExecutionHistoryModal to show pipeline executions
7. ⏳ Create PipelineLogsModal component

---

## Next Steps

1. **Quick Win**: Implement backend API updates (Phase 1) to make existing releases deployable
2. **View Logs**: Implement Phase 3 to see pipeline execution logs
3. **Create Releases**: Implement Phase 2 UI updates to create new pipeline-based releases

Would you like me to continue with implementing Phase 1 (Backend API updates) now?
