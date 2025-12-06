export async function scoreEmotion(imageBytes: Buffer | Uint8Array): Promise<{emotion: string; confidence: number}> {
  // Replace with your real scoring call
  // For now return a placeholder
  return { emotion: 'Happy', confidence: 0.93 };
}
