export interface TodoItem {
  id: string;
  title: string;
  priority: string;
  phase: string;
  status: string;
  created: string;
  filename: string;
}

export interface TodoFilters {
  priority?: string;
  status?: string;
  q?: string;
}

export function listPendingTodos(projectDir: string, filters?: TodoFilters): Promise<TodoItem[]>;
export function getTodoDetail(projectDir: string, todoId: string): Promise<TodoItem & { html: string }>;
export function createTodo(projectDir: string, todoData: { title: string; priority: string; description: string; phase?: string }): Promise<string>;
export function listDoneTodos(projectDir: string): Promise<Array<{ id: string; filename: string; title: string; priority: string; phase: string; completedAt: string | null }>>;
export function completeTodo(projectDir: string, todoId: string): Promise<void>;
