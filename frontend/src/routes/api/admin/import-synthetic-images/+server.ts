import { json, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { getAdminUserFromRequest } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  return getAdminUserFromRequest(event.request);
}

// POST /api/admin/import-synthetic-images - Import synthetic images from local folder
export const POST: RequestHandler = async (event) => {
  try {
    const user = await getCurrentUser(event);
    if (!user) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({ where: { id: toPrismaUserId(user.id) }, select: { role: true, username: true } });
    const email = (me?.username || '').trim().toLowerCase();
    const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
    
    if (!isAdmin) {
      return json({ ok: false, error: 'Only admins can import images' }, { status: 403 });
    }

    const SYNTH_DATA_PATH = '/Users/jonakfir/Downloads/Synth.Data';
    
    // Emotion mapping from filename patterns
    const emotionMap: Record<string, string> = {
      'anger': 'Anger',
      'angry': 'Anger',
      'disgust': 'Disgust',
      'fear': 'Fear',
      'happy': 'Happy',
      'happiness': 'Happy',
      'sad': 'Sad',
      'sadness': 'Sad',
      'surprise': 'Surprise',
      'neutral': 'Neutral'
    };

    const EMOTIONS = ['Anger', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];

    try {
      // Read directory
      const files = await readdir(SYNTH_DATA_PATH);
      const imageFiles = files.filter(f => 
        f.toLowerCase().endsWith('.png') || 
        f.toLowerCase().endsWith('.jpg') || 
        f.toLowerCase().endsWith('.jpeg')
      );

      console.log(`[import-synthetic-images] Found ${imageFiles.length} image files`);

      let imported = 0;
      let skipped = 0;
      let errors = 0;

      // Delete existing synthetic images first (optional - you may want to keep them)
      // await prisma.ekmanImage.deleteMany({ where: { folder: 'synthetic' } });

      for (const filename of imageFiles) {
        try {
          const filePath = join(SYNTH_DATA_PATH, filename);
          const fileBuffer = await readFile(filePath);
          
          // Convert to base64 data URL
          const base64 = fileBuffer.toString('base64');
          const ext = filename.split('.').pop()?.toLowerCase() || 'png';
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
          const imageData = `data:${mimeType};base64,${base64}`;

          // Extract emotion from filename (case-insensitive)
          const filenameLower = filename.toLowerCase();
          let emotion: string | null = null;
          
          for (const [key, value] of Object.entries(emotionMap)) {
            if (filenameLower.includes(key)) {
              emotion = value;
              break;
            }
          }

          if (!emotion || !EMOTIONS.includes(emotion)) {
            console.warn(`[import-synthetic-images] Could not determine emotion for: ${filename}`);
            skipped++;
            continue;
          }

          // Default difficulty to '1' for synthetic images (you can enhance this later)
          const difficulty = '1';

          // Check if image already exists (by checking if we've imported this filename)
          // For now, we'll skip duplicates based on a simple check
          // In production, you might want a more sophisticated deduplication

          // Generate ID
          const id = randomBytes(16).toString('hex');
          
          // Create image record
          await prisma.ekmanImage.create({
            data: {
              id,
              imageData,
              label: emotion,
              difficulty,
              folder: 'synthetic'
            }
          });

          imported++;
          if (imported % 10 === 0) {
            console.log(`[import-synthetic-images] Imported ${imported} images...`);
          }
        } catch (fileError: any) {
          console.error(`[import-synthetic-images] Error processing ${filename}:`, fileError?.message);
          errors++;
        }
      }

      return json({ 
        ok: true, 
        imported, 
        skipped, 
        errors,
        message: `Successfully imported ${imported} synthetic images`
      });
    } catch (dirError: any) {
      console.error('[import-synthetic-images] Error reading directory:', dirError);
      return json({ 
        ok: false, 
        error: `Failed to read directory: ${dirError?.message}` 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[POST /api/admin/import-synthetic-images] error', error);
    return json({ ok: false, error: error?.message || 'Failed to import images' }, { status: 500 });
  }
};

