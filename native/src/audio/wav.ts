/**
 * Encodeur WAV 16 bits.
 *
 * `react-native-audio-api` sait décoder et rendre, mais n'écrit pas de fichier
 * depuis un tampon traité. Le WAV se code en quelques lignes, sans perte, et
 * toutes les applications iOS et Android l'ouvrent — c'est le format juste
 * pour une récitation qu'on veut garder ou faire écouter.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channels.length;
  const frames = channels[0].length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);          // taille du bloc fmt
  view.setUint16(20, 1, true);           // PCM entier
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  ascii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numChannels; c++) {
      // Écrêtage franc plutôt que débordement : un dépassement d'entier
      // produirait un craquement au lieu d'une saturation.
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      offset += 2;
    }
  }
  return new Uint8Array(buffer);
}
