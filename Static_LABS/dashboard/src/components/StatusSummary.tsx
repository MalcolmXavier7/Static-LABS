import { CheckCircle, AlertCircle, Clock, Activity } from 'lucide-react';

interface StatusSummaryProps {
  totalProjects: number;
  runningProjects: number;
  unhealthyProjects: number;
  stalledProjects: number;
}

function StatusSummary({
  totalProjects,
  runningProjects,
  unhealthyProjects,
  stalledProjects,
}: StatusSummaryProps) {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">Total Projects</p>
            <p className="mt-2 text-3xl font-bold text-white">{totalProjects}</p>
          </div>
          <Activity className="text-blue-500" size={32} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">Running</p>
            <p className="mt-2 text-3xl font-bold text-green-400">{runningProjects}</p>
          </div>
          <CheckCircle className="text-green-500" size={32} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">Unhealthy</p>
            <p className="mt-2 text-3xl font-bold text-red-400">{unhealthyProjects}</p>
          </div>
          <AlertCircle className="text-red-500" size={32} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">Stalled</p>
            <p className="mt-2 text-3xl font-bold text-yellow-400">{stalledProjects}</p>
          </div>
          <Clock className="text-yellow-500" size={32} />
        </div>
      </div>
    </div>
  );
}

export default StatusSummary;
