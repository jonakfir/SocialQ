// Dynamic import to avoid server-side bundling issues
let humanInstance: any = null;

async function getHumanInstance(): Promise<any> {
  // Only import on server-side if available, otherwise return null
  if (typeof window !== 'undefined') {
    // Client-side: use window.Human from CDN
    return null; // Client should use CDN version
  }
  
  // Server-side: try dynamic import
  if (!humanInstance) {
    try {
      const { Human } = await import('@vladmandic/human');
      humanInstance = new Human({
        backend: 'cpu', // Use CPU backend for Node.js
        modelBasePath: 'https://cdn.jsdelivr.net/npm/@vladmandic/human/models',
        face: {
          enabled: true,
          detector: { enabled: true },
          mesh: { enabled: false }, // Not needed for emotion detection
          emotion: { enabled: true } // Enable emotion detection
        },
        // Disable other features we don't need for emotion detection
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        segmentation: { enabled: false }
      });
      
      // Load models
      await humanInstance.load();
      await humanInstance.warmup();
    } catch (error) {
      console.warn('[scoring] Human.js not available on server:', error);
      // Return null if not available (e.g., on Vercel)
      return null;
    }
  }
  
  return humanInstance;
}

/**
 * Detects emotion in an image buffer
 * @param imageBytes - Image buffer (JPEG, PNG, etc.)
 * @returns Object with detected emotion and confidence score
 */
export async function scoreEmotion(imageBytes: Buffer | Uint8Array): Promise<{emotion: string; confidence: number}> {
  try {
    const human = await getHumanInstance();
    
    // If human is not available (e.g., on Vercel), return neutral
    if (!human) {
      console.log('[scoreEmotion] Human.js not available, returning Neutral');
      return { emotion: 'Neutral', confidence: 0.5 };
    }
    
    // Human.js can process image buffers directly in Node.js
    // The detect method accepts Buffer, Uint8Array, or image data
    const result = await human.detect(imageBytes as any);
    
    // Extract emotion from the first detected face
    if (result.face && result.face.length > 0) {
      const face = result.face[0];
      
      if (face.emotion && Array.isArray(face.emotion) && face.emotion.length > 0) {
        // Sort emotions by confidence (score)
        const emotions = [...face.emotion].sort((a, b) => (b.score || 0) - (a.score || 0));
        const topEmotion = emotions[0];
        
        // Map emotion names to standard format (capitalize first letter)
        const emotionName = topEmotion.emotion 
          ? topEmotion.emotion.charAt(0).toUpperCase() + topEmotion.emotion.slice(1).toLowerCase()
          : 'Neutral';
        
        const confidence = topEmotion.score || 0;
        
        console.log(`[scoreEmotion] Detected: ${emotionName} (${(confidence * 100).toFixed(1)}%)`);
        
        return {
          emotion: emotionName,
          confidence
        };
      }
    }
    
    // No face or emotion detected
    console.log('[scoreEmotion] No face or emotion detected, returning Neutral');
    return { emotion: 'Neutral', confidence: 0.5 };
    
  } catch (error: any) {
    console.error('[scoreEmotion] Error:', error?.message || error);
    // Fallback to neutral on error
    return { emotion: 'Neutral', confidence: 0.5 };
  }
}
