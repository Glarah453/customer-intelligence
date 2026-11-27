'use client';

import { useActionState } from 'react';
import { trainKmeans, type TrainState } from '@/app/train/actions';

export default function TrainForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(trainKmeans, null);

  if (!enabled) {
    return (
      {/* <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"> */}
      {/*   El entrenamiento está deshabilitado en este entorno: se ejecuta solo en local */}
      {/*   (<code>TRAINING_ENABLED=true</code>). Aquí se muestran los resultados del último modelo entrenado. */}
      {/* </div> */}
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-500">Número de clusters (k)</span>
          <select name="k" defaultValue="5" className="rounded-lg border bg-white px-3 py-2">
            <option value="auto">Automático (mejor silhouette)</option>
            {[3, 4, 5, 6, 7, 8].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Entrenando…' : 'Entrenar K-Means'}
        </button>
      </div>
      {state && (
        <div className="space-y-2">
          <p className={`text-sm font-medium ${state.ok ? 'text-green-700' : 'text-red-700'}`}>
            {state.ok
              ? '✓ Entrenamiento completado. Los resultados de abajo ya están actualizados.'
              : '✗ El entrenamiento falló. Revisa el log.'}
          </p>
          <details open={!state.ok}>
            <summary className="cursor-pointer text-xs text-gray-500">Ver log</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100">
              {state.log}
            </pre>
          </details>
        </div>
      )}

      {/* {state && ( */}
      {/*   <pre */}
      {/*     className={`max-h-64 overflow-auto rounded-lg p-3 text-xs ${ */}
      {/*       state.ok ? 'bg-gray-900 text-gray-100' : 'bg-red-950 text-red-100' */}
      {/*     }`} */}
      {/*   > */}
      {/*     {state.log} */}
      {/*   </pre> */}
      {/* )} */}
    </form>
  );
}
