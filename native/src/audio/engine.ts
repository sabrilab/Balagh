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

import { buildChain, presetById, peaks as peaksOf } from '../core/audio.mjs';
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

export async function decodeTake(uri: string) {
  const buffer = await decodeAudioData(uri);
  return buffer;
}

/** Enveloppe de crête réduite, suffisante pour dessiner une forme d'onde. */
export function takePeaks(buffer: { getChannelData(c: number): Float32Array }, count = 160): number[] {
  return Array.from(peaksOf(buffer.getChannelData(0), count));
}

/* --- écoute --------------------------------------------------------------- */

let playing: { stop(): void } | null = null;

export function stopPlayback() {
  if (playing) { try { playing.stop(); } catch { /* déjà arrêté */ } playing = null; }
}

export function playWithEffects(buffer: any, presetId: string, opts: ChainOptions, onEnd?: () => void) {
  stopPlayback();
  const c = context();
  const preset = presetById(presetId) as Preset;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const chain = buildChain(c, preset, opts);
  src.connect(chain.input);
  chain.output.connect(c.destination);
  src.onEnded = () => { playing = null; onEnd?.(); };
  src.start(c.currentTime);
  playing = { stop: () => src.stop(c.currentTime) };
  return playing;
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
