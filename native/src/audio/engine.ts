/**
 * Moteur audio natif.
 *
 * `react-native-audio-api` implémente la même interface que la Web Audio API :
 * la chaîne d'effets vient telle quelle du noyau partagé, et les acoustiques
 * sonnent exactement comme sur le web.
 *
 * Un avantage du natif : OfflineAudioContext rend plus vite que le temps réel.
 * Là où le navigateur devait rejouer la prise en entier pour l'exporter, le
 * téléphone la calcule d'un coup.
 *
 * Contrainte n.3 : effets sur la VOIX SEULE. Aucun oscillateur ici.
 */
import {
  AudioContext,
  OfflineAudioContext,
  AudioRecorder,
  AudioManager,
  decodeAudioData,
  FileFormat,
  FileDirectory,
} from 'react-native-audio-api';
import { Directory, File, Paths } from 'expo-file-system';

import { buildChain, presetById, peaks as peaksOf, detectSilence, trimEdges } from '../core/audio.mjs';
import { renderRegions, totalDuration } from '../core/edit.mjs';
import type { Region } from '../store';
import { encodeWav } from './wav';

export type Preset = {
  id: string; name: string; desc: string;
  rt: number; wet: number; pre: number; tone: number;
  delay?: number; fb?: number; dw?: number; premium?: boolean;
};
export type ChainOptions = { wet?: number; presence?: number };

let ctx: AudioContext | null = null;
function context(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/* --- permission et session ---------------------------------------------- */

export async function ensureMicPermission(): Promise<boolean> {
  const current = await AudioManager.checkRecordingPermissions();
  if (current === 'Granted') return true;
  const asked = await AudioManager.requestRecordingPermissions();
  return asked === 'Granted';
}

function configureSession() {
  AudioManager.setAudioSessionOptions({
    iosCategory: 'playAndRecord',
    iosMode: 'measurement',        // pas de traitement de la voix par le système
    iosOptions: ['defaultToSpeaker', 'allowBluetoothA2DP'],
  });
}

/* --- captation ----------------------------------------------------------- */

let recorder: AudioRecorder | null = null;
let recordingName = '';

export async function startRecording(): Promise<void> {
  configureSession();
  await AudioManager.setAudioSessionActivity(true);
  recordingName = `talawa-${Date.now()}`;
  recorder = new AudioRecorder();
  recorder.enableFileOutput({
    directory: FileDirectory.Document,
    subDirectory: 'talawa',
    fileNamePrefix: recordingName,
    channelCount: 1,
    format: FileFormat.M4A,
  });
  await recorder.start();
}

export async function stopRecording(): Promise<string | null> {
  if (!recorder) return null;
  const result = await recorder.stop();
  recorder = null;
  const uri = (result as any)?.value?.uri ?? (result as any)?.uri ?? null;
  return typeof uri === 'string' ? uri : null;
}

/* --- décodage et analyse -------------------------------------------------- */

/**
 * Prises décodées.
 *
 * Décoder relit et convertit tout le fichier : on ne le refait pas à chaque
 * geste de montage. La carte est bornée à quelques prises — au-delà, la plus
 * ancienne sort, la relire coûte moins cher que de saturer la mémoire.
 */
const decoded = new Map<string, any>();

export async function decodeTake(uri: string) {
  const connu = decoded.get(uri);
  if (connu) return connu;
  const buffer = await decodeAudioData(uri);
  decoded.set(uri, buffer);
  if (decoded.size > 4) decoded.delete(decoded.keys().next().value as string);
  return buffer;
}

export const forgetTake = (uri: string) => { decoded.delete(uri); editedCache.delete(uri); };

/* --- montage -------------------------------------------------------------- */

const editedCache = new Map<string, { sig: string; buffer: any }>();
const editSig = (regions: Region[]) => regions.map((r) => `${r.id}:${r.start.toFixed(4)}:${r.end.toFixed(4)}`).join('|');

/**
 * Tampon effectivement lu et exporté. La prise d'origine n'est jamais
 * réécrite : on assemble les régions à la demande. Un montage intact ne coûte
 * rien — on rend le tampon source tel quel.
 */
export async function editedTake(uri: string, regions: Region[], sourceDuration: number) {
  const buffer = await decodeTake(uri);
  const intact = regions.length === 1 && regions[0].start <= 0.001 && regions[0].end >= sourceDuration - 0.001;
  if (intact) return buffer;
  const sig = editSig(regions);
  const connu = editedCache.get(uri);
  if (connu && connu.sig === sig) return connu.buffer;
  const monte = renderRegions(context(), buffer, regions);
  editedCache.set(uri, { sig, buffer: monte });
  return monte;
}

/** Plages sans voix, datées dans la source, et bornes utiles de la prise. */
export function analyseSilence(buffer: any) {
  const channel = buffer.getChannelData(0) as Float32Array;
  const sr = buffer.sampleRate as number;
  return {
    plages: (detectSilence(channel, sr, { minSilenceMs: 700 }) as { start: number; end: number }[])
      .filter((p) => p.end - p.start >= 0.7),
    bornes: trimEdges(channel, sr) as { start: number; end: number },
  };
}

/** Enveloppe de crête d'un montage, pour dessiner sa barre. */
export const regionPeaks = (buffer: any, count = 120): number[] => Array.from(peaksOf(buffer.getChannelData(0), count));

export const editedDurationOf = (regions: Region[]) => totalDuration(regions) as number;

/** Enveloppe de crête réduite, suffisante pour dessiner une forme d'onde. */
export function takePeaks(buffer: { getChannelData(c: number): Float32Array }, count = 160): number[] {
  return Array.from(peaksOf(buffer.getChannelData(0), count));
}

/* --- écoute --------------------------------------------------------------- */

let playing: { stop(): void; cancelled?: boolean; elapsed?: () => number } | null = null;

export const playhead = () => (playing && playing.elapsed ? playing.elapsed() : 0);

export function stopPlayback() {
  if (playing) { try { playing.stop(); } catch { /* déjà arrêté */ } playing = null; }
}

export function playWithEffects(buffer: any, presetId: string, opts: ChainOptions, onEnd?: () => void, offset = 0) {
  stopPlayback();
  const c = context();
  const preset = presetById(presetId) as Preset;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const chain = buildChain(c, preset, opts);
  src.connect(chain.input);
  chain.output.connect(c.destination);
  const from = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.01)));
  const startedAt = c.currentTime;
  // `stop()` déclenche aussi `onEnded` : sans ce drapeau, une pause serait
  // prise pour une fin de lecture et ramènerait la tête au début.
  const handle = {
    cancelled: false,
    stop: () => { handle.cancelled = true; src.stop(c.currentTime); },
    elapsed: () => from + (c.currentTime - startedAt),
  };
  src.onEnded = () => { playing = null; if (!handle.cancelled) onEnd?.(); };
  src.start(c.currentTime, from);
  playing = handle;
  return handle;
}

/* --- rendu et export ------------------------------------------------------ */

/**
 * Rend la prise à travers la chaîne, hors temps réel. La queue de
 * réverbération est ajoutée à la durée : sans cela, un « sous le dôme » de
 * 5,2 s se ferait couper net.
 */
export async function renderProcessed(buffer: any, presetId: string, opts: ChainOptions) {
  const preset = presetById(presetId) as Preset;
  const sampleRate = buffer.sampleRate;
  const tail = preset.rt + (preset.delay ? preset.delay * 4 : 0) + 0.25;
  const length = Math.ceil((buffer.duration + tail) * sampleRate);

  const offline = new OfflineAudioContext(2, length, sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const chain = buildChain(offline, preset, opts);
  src.connect(chain.input);
  chain.output.connect(offline.destination);
  src.start(0);
  return await offline.startRendering();
}

/** Écrit le rendu en WAV dans le dossier de documents et renvoie son chemin. */
export async function exportWav(rendered: any, baseName: string): Promise<string> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) channels.push(rendered.getChannelData(c));
  const bytes = encodeWav(channels, rendered.sampleRate);

  const dir = new Directory(Paths.document, 'talawa');
  if (!dir.exists) dir.create({ intermediates: true });
  const safe = baseName.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'recitation';
  const file = new File(dir, `${safe}.wav`);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file.uri;
}
