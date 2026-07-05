import { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface Project {
  id: string;
  name: string;
  assignedPort: number | null;
}

interface AssignPortModalProps {
  project: Project;
  apiBase: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AssignPortModal({ project, apiBase, onClose, onSuccess }: AssignPortModalProps) {
  const [selectedPort, setSelectedPort] = useState<string>('auto');
  const [customPort, setCustomPort] = useState<string>('');
  const [nextAvailable, setNextAvailable] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNextAvailable();
  }, []);

  const fetchNextAvailable = async () => {
    try {
      const response = await axios.get(`${apiBase}/api/ports/next-available`);
      setNextAvailable(response.data.data.nextAvailablePort);
    } catch (err) {
      console.error('Failed to fetch next available port:', err);
    }
  };

  const handleAssign = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const portToAssign = selectedPort === 'auto' ? null : parseInt(customPort, 10);

      await axios.post(`${apiBase}/api/ports/assign`, {
        projectId: project.id,
        preferredPort: portToAssign,
      });

      onSuccess();
    } catch (err: any) {
      setError(
        err.response?.data?.error || 'Failed to assign port. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
      <div className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-lg">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Assign Port</h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-slate-800 transition"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Project Info */}
        <div className="mb-6 rounded-lg bg-slate-800/50 p-3">
          <p className="text-sm text-slate-400">Project</p>
          <p className="font-medium text-white">{project.name}</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 flex gap-2 rounded-lg border border-red-700 bg-red-900/20 p-3">
            <AlertCircle className="text-red-500" size={18} />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Port Selection */}
        <div className="mb-6 space-y-4">
          <label className="flex items-center gap-3 cursor-pointer rounded-lg p-3 hover:bg-slate-800 transition border-2 border-slate-700"
            style={{ borderColor: selectedPort === 'auto' ? '#3b82f6' : undefined, backgroundColor: selectedPort === 'auto' ? 'rgba(59, 130, 246, 0.1)' : undefined }}>
            <input
              type="radio"
              name="port-selection"
              value="auto"
              checked={selectedPort === 'auto'}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="h-4 w-4"
            />
            <div className="flex-1">
              <p className="font-medium text-white">Auto-Assign</p>
              <p className="text-xs text-slate-400">
                Next available: {nextAvailable ? `:${nextAvailable}` : 'Loading...'}
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-lg p-3 hover:bg-slate-800 transition border-2 border-slate-700"
            style={{ borderColor: selectedPort === 'manual' ? '#3b82f6' : undefined, backgroundColor: selectedPort === 'manual' ? 'rgba(59, 130, 246, 0.1)' : undefined }}>
            <input
              type="radio"
              name="port-selection"
              value="manual"
              checked={selectedPort === 'manual'}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="h-4 w-4"
            />
            <div className="flex-1">
              <p className="font-medium text-white">Manual Port</p>
              <input
                type="number"
                min="3100"
                max="3199"
                value={customPort}
                onChange={(e) => setCustomPort(e.target.value)}
                placeholder="e.g., 3100"
                className="mt-2 w-full rounded bg-slate-800 px-2 py-1 text-sm text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-200 hover:bg-slate-800 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={isLoading || (selectedPort === 'manual' && !customPort)}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isLoading ? 'Assigning...' : 'Assign Port'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AssignPortModal;
