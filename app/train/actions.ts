'use server';

import { spawn } from 'node:child_process';
import { updateTag } from 'next/cache';

export type TrainState = { ok: boolean; log: string } | null;

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

export async function trainKmeans(_prev: TrainState, formData: FormData): Promise<TrainState> {
  // doble guarda: variable de entorno y no estar en Vercel
  if (process.env.TRAINING_ENABLED !== 'true' || process.env.VERCEL) {
    return { ok: false, log: 'El entrenamiento está deshabilitado en este entorno.' };
  }

  const raw = String(formData.get('k') ?? 'auto');
  const k = raw === 'auto' ? null : Number(raw);
  if (k !== null && (!Number.isInteger(k) || k < 2 || k > 8)) {
    return { ok: false, log: 'Valor de k inválido (debe estar entre 2 y 8).' };
  }

  const args = ['tsx', 'scripts/train-kmeans.ts', ...(k ? [`--k=${k}`] : [])];

  const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
    // const child = spawn('npx', args, { shell: true, cwd: process.cwd(), env: process.env });
    const child = spawn('npx', args, {
      shell: true,
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    // child.on('close', (code) => resolve({ code, out }));
    child.on('close', (code) => resolve({ code, out: stripAnsi(out) }));
  });

  if (code === 0) updateTag('dashboard'); // invalida la caché: las páginas muestran la corrida nueva
  return { ok: code === 0, log: out };
}
