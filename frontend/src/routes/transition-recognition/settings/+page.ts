import { redirect } from '@sveltejs/kit';

export const ssr = false;

export function load({ url }) {
  const level = url.searchParams.get('level')?.toLowerCase();
  const mode = level === 'challenge' ? 'Challenge' : 'Normal';
  throw redirect(302, `/transition-recognition/quiz/${mode}`);
}
