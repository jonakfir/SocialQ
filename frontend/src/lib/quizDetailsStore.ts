/**
 * In-memory store for the most recent facial recognition quiz details (including image URLs/data for thumbnails).
 * Used so the "Your Answers" stats page can show thumbnails without hitting sessionStorage quota.
 */
import { writable } from 'svelte/store';

export type QuizDetailRow = {
  index: number;
  img?: string;
  correct: string;
  picked: string;
  isCorrect: boolean;
};

export const lastFrQuizDetails = writable<QuizDetailRow[] | null>(null);
