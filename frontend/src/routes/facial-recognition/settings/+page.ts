import { redirect } from '@sveltejs/kit';

export const ssr = false;

export function load({ url }) {
  const level = url.searchParams.get('level') || '1';
  const difficulty = ['1', '2', '3', '4', '5'].includes(level) ? level : '1';
  throw redirect(302, `/facial-recognition/quiz/${difficulty}`);
}
