export function getUserKey(): string {
  const uid = typeof localStorage !== 'undefined' ? localStorage.getItem('userId') : null;
  const uname = typeof localStorage !== 'undefined' ? (localStorage.getItem('username') || 'guest') : 'guest';
  return uid ? `${uname}_${uid}` : uname;
}