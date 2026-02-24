interface Todo {
  id: string;
  title: string;
  priority: string;
  phase?: string;
  status?: string;
  created?: string;
  filename?: string;
}

interface TodosTabProps {
  todos: Todo[];
  showDone?: boolean;
}

interface TodoListFragmentProps {
  todos: Todo[];
}

export function TodosTab({ todos }: TodosTabProps) {
  return (
    <div x-data="{ showCreate: false, showDone: false, search: '' }">
      {/* Search + filters row */}
      <div class="explorer-toolbar">
        <input
          type="text"
          placeholder="Filter todos..."
          x-model="search"
          class="explorer-search"
          aria-label="Filter todos by title"
        />
        <button x-on:click="showCreate = !showCreate" class="btn btn--primary btn--sm">
          + New Todo
        </button>
        <button
          x-on:click="showDone = !showDone"
          hx-get="/api/explorer/todos/done"
          hx-trigger="click[showDone] once"
          hx-target="#todos-done-list"
          hx-swap="innerHTML"
          class="btn btn--ghost btn--sm"
        >
          Done (<span x-text="showDone ? 'hide' : 'show'">show</span>)
        </button>
      </div>

      {/* Create form — shown when showCreate is true */}
      <div x-show="showCreate" x-cloak class="explorer-create-form">
        <TodoCreateForm />
      </div>

      {/* Pending list with Alpine search filter */}
      <div
        id="todos-pending-list"
        hx-get="/api/explorer/todos/list"
        hx-trigger="todo-created from:body"
        hx-swap="innerHTML"
      >
        <TodoListFragment todos={todos} />
      </div>

      {/* Done list — hidden until toggled */}
      <div x-show="showDone" x-cloak>
        <h3 class="explorer-section-title">Completed</h3>
        <div id="todos-done-list"></div>
      </div>
    </div>
  );
}

export function TodoListFragment({ todos }: TodoListFragmentProps) {
  return (
    <ul class="explorer-list" role="list">
      {todos.length === 0 && <li class="explorer__loading">No pending todos.</li>}
      {todos.map((todo) => (
        <li
          class="explorer-item"
          key={todo.id}
          x-show={`!search || '${todo.title.toLowerCase()}'.includes(search.toLowerCase())`}
        >
          <div class="explorer-item__header">
            <span class={`explorer-badge explorer-badge--${todo.priority}`}>{todo.priority}</span>
            <span class="explorer-item__title">{todo.title}</span>
            {todo.phase && <span class="explorer-item__meta">Phase {todo.phase}</span>}
            <button
              class="btn btn--danger btn--sm"
              hx-post={`/api/explorer/todos/${todo.id}/complete`}
              hx-target="closest li"
              hx-swap="outerHTML"
              aria-label={`Complete todo: ${todo.title}`}
            >
              Done
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TodoCreateForm() {
  return (
    <form
      hx-post="/api/explorer/todos"
      hx-target="#todos-pending-list"
      hx-swap="innerHTML"
      hx-on:htmx:after-request="this.reset(); $dispatch('close-create')"
      class="explorer-form"
    >
      <div class="explorer-form__row">
        <label class="explorer-form__label" for="todo-title">
          Title
        </label>
        <input
          id="todo-title"
          name="title"
          type="text"
          required
          class="explorer-search"
          placeholder="What needs doing?"
        />
      </div>
      <div class="explorer-form__row">
        <label class="explorer-form__label" for="todo-priority">
          Priority
        </label>
        <select id="todo-priority" name="priority" class="explorer-search">
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="explorer-form__row">
        <label class="explorer-form__label" for="todo-phase">
          Phase (optional)
        </label>
        <input
          id="todo-phase"
          name="phase"
          type="text"
          class="explorer-search"
          placeholder="e.g. 40"
        />
      </div>
      <div class="explorer-form__row">
        <label class="explorer-form__label" for="todo-desc">
          Description
        </label>
        <textarea id="todo-desc" name="description" class="explorer-search" rows={3}></textarea>
      </div>
      <div class="explorer-form__actions">
        <button type="submit" class="btn btn--primary">
          Create
        </button>
        <button type="button" class="btn btn--ghost" x-on:click="showCreate = false">
          Cancel
        </button>
      </div>
    </form>
  );
}
