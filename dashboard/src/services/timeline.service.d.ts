import { TTLCache } from '../utils/cache.js';

export interface TimelineEvent {
  type: 'commit' | 'phase-transition' | 'todo-completion';
  id: string;
  date: Date;
  title: string;
  author?: string;
}

export interface TimelineFilters {
  types?: string[];
  phase?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const cache: TTLCache;

export function getTimelineEvents(projectDir: string, filters?: TimelineFilters): Promise<TimelineEvent[]>;
