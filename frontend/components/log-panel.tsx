interface LogPanelProps {
  logs: string[];
}

export function LogPanel({ logs }: LogPanelProps) {
  return (
    <div className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-50">Production Logs</h3>
        <p className="mt-1 text-sm text-slate-400">
          Signals from recent runs that can help you triangulate the production issue.
        </p>
      </div>
      <div className="panel-strong overflow-hidden rounded-2xl">
        <pre className="m-0 overflow-x-auto p-4 text-sm leading-7 text-teal-100">
          {logs.join("\n")}
        </pre>
      </div>
    </div>
  );
}
