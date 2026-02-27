// audioProcessor.js

/**
 * This is an AudioWorkletProcessor script. It runs in a separate thread
 * and handles audio data processing without blocking the main UI thread.
 *
 * It receives Float32 audio data from the microphone, converts it to Int16,
 * and posts it back to the main thread for encoding.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    // We expect one input, with one channel (mono).
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true; // Keep processor alive
    }

    const inputChannel = input[0];
    if (!inputChannel) {
      return true;
    }

    // Convert Float32Array to Int16Array.
    // The raw data is in the range [-1.0, 1.0]. We need to convert it to [-32768, 32767].
    const buffer = new Int16Array(inputChannel.length);
    for (let i = 0; i < inputChannel.length; i++) {
      const s = Math.max(-1, Math.min(1, inputChannel[i]));
      buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Post the Int16 buffer back to the main thread.
    // The second argument is a list of Transferable objects.
    // Transfering the buffer's ownership is more efficient than copying.
    this.port.postMessage(buffer, [buffer.buffer]);

    // Return true to let the browser know the processor should continue running.
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
