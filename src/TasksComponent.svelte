<script lang="ts">
    import TaskItemComponent from 'TaskItemComponent.svelte'
    import type TaskTracker from 'TaskTracker'
    import Tasks, { type TaskItem } from 'Tasks'
    import { settings } from 'stores'
    import { Menu } from 'obsidian'
    import type Timer from './Timer'
    import { slide } from 'svelte/transition'

    export let tasks: Tasks
    export let tracker: TaskTracker
    export let timer: Timer
    export let render: (content: string, el: HTMLElement) => void
    const r = (content: string, el: HTMLElement) => {
        render(content, el)
    }

    let status = ''
    let query = ''

    // Lógica de filtrado, ordenación y agrupación
    $: filtered = $tasks
        ? $tasks.list.filter((item) => {
              let statusMatch = true
              let textMatch = true
              if (query) {
                  textMatch = item.name.toLowerCase().includes(query.toLowerCase())
              }
              if (status) {
                  if (status === 'todo') statusMatch = !item.checked
                  if (status === 'completed') statusMatch = item.checked
              }
              return statusMatch && textMatch
          })
        : []
    
    $: sorted = filtered.slice().sort((a, b) => {
        if (a.checked !== b.checked) {
            return a.checked ? 1 : -1;
        }
        return a.name.localeCompare(b.name);
    });

    $: groupedTasks = groupBy(sorted, 'fileName');
    
    let collapsedGroups: { [key:string]: boolean } = {};

    const toggleGroup = (fileName: string) => {
        collapsedGroups[fileName] = !collapsedGroups[fileName];
    };

    function groupBy<T>(array: T[], key: keyof T) {
        return array.reduce((result, currentValue) => {
            const groupKey = String(currentValue[key]);
            (result[groupKey] = result[groupKey] || []).push(currentValue);
            return result;
        }, {} as { [key: string]: T[] });
    }

    const activeTask = (task: TaskItem) => {
        tracker.active(task)
    }

    const changeTaskName = (e: Event) => {
        let target = e.target as HTMLInputElement
        tracker.setTaskName(target.value)
    }

    const removeTask = () => {
        tracker.clear()
    }

    const progress = (item: TaskItem) => {
        if (!$settings.showTaskProgress) return 0
        if (item.expected > 0 && item.actual >= 0) {
            return ((item.actual / item.expected) * 100).toFixed(2)
        }
        return 0
    }

    const progressText = (item: TaskItem) => {
        let { actual, expected } = item
        if (expected > 0) {
            let unfinished = expected - actual
            let max = Math.max(expected, actual)
            if (max > 10) {
                return unfinished > 0 ? `◌ x ${unfinished} 🍅 x ${actual}` : `🍅 x ${expected}  🥫 x ${Math.abs(unfinished)}`
            } else {
                return unfinished > 0 ? `${'🍅'.repeat(actual)}${'◌'.repeat(unfinished)}` : `${'🍅'.repeat(expected)}${'🥫'.repeat(Math.abs(unfinished))}`
            }
        } else {
            return actual > 10 ? `🍅 x ${actual}` : actual > 0 ? `${'🍅'.repeat(actual)}` : `- -`
        }
    }
    
    const showTaskMenu = (task: TaskItem) => (e: MouseEvent) => {
        const menu = new Menu()
        menu.addItem((item) => {
            item.setTitle('Open').onClick(() => {
                tracker.openTask(e, task)
            })
        })
        menu.showAtMouseEvent(e)
    }

    $: strokeDasharray = 2 * Math.PI * 45;
    $: strokeDashoffset = $timer.count > 0 ? strokeDasharray * (1 - ($timer.count - $timer.remained.millis) / $timer.count) : strokeDasharray;
</script>

<!-- Contenedor Principal de la Vista -->
<div class="pomodoro-view-container">

    <!-- Sección del Temporizador -->
    <div class="pomodoro-timer-container">
        <div class="timer-display">
            <svg class="timer-circle-svg" viewBox="0 0 100 100">
                <circle class="timer-circle-background" cx="50" cy="50" r="45"></circle>
                <circle 
                    class="timer-circle-progress" 
                    cx="50" 
                    cy="50" 
                    r="45"
                    style="stroke-dasharray: {strokeDasharray}; stroke-dashoffset: {strokeDashoffset};"
                ></circle>
            </svg>
            <div class="timer-text">
                <span>{$timer.remained.minutes}</span>
                <span class="timer-colon">:</span>
                <span>{$timer.remained.seconds}</span>
            </div>
        </div>
        <div class="timer-controls">
            <button class="timer-button" on:click={() => timer.toggleTimer()} title={$timer.running ? 'Pausar' : 'Reanudar'}>
                {#if $timer.running}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>
                {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                {/if}
            </button>
            <button class="timer-button" on:click={() => timer.reset()} title="Resetear">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-cw"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/></svg>
            </button>
        </div>
        <div class="timer-mode" on:click={() => timer.toggleMode()}>
            {$timer.mode === 'WORK' ? 'Sesión de Trabajo' : 'Descanso'}
        </div>
    </div>

    <!-- Sección de Tareas -->
    <div class="pomodoro-tasks-wrapper">
        <div class="pomodoro-tasks-header">
            <div class="pomodoro-tasks-header-title">
                <span class="pomodoro-tasks-count">
                    {filtered.length} tareas
                </span>
            </div>
            {#if $tasks.list.length > 0}
                <div class="pomodoro-tasks-active">
                    {#if $tracker.task}
                        <div class="pomodoro-tasks-item">
                            <div class="pomodoro-tasks-name">
                                <input type="text" value={$tracker.task?.name} on:input={changeTaskName} />
                                
                                {#if $timer.running && $timer.mode === 'WORK'}
                                    <span class="pomodoro-tasks-finish" on:click={() => timer.finishEarly()} title="Finalizar sesión de trabajo">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                    </span>
                                {/if}

                                <span class="pomodoro-tasks-remove" on:click={removeTask}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </span>
                            </div>
                        </div>
                    {/if}
                </div>
                <div class="pomodoro-tasks-toolbar">
                    <div class="pomodoro-tasks-filters">
                        <span on:click={() => (status = '')} class="pomodoro-tasks-filter {status === '' ? 'filter-active' : ''}">All</span>
                        <span on:click={() => (status = 'todo')} class="pomodoro-tasks-filter {status === 'todo' ? 'filter-active' : ''}">Todo</span>
                        <span on:click={() => (status = 'completed')} class="pomodoro-tasks-filter {status === 'completed' ? 'filter-active' : ''}">Completed</span>
                    </div>
                </div>
                <div class="pomodoro-tasks-text-filter">
                    <input type="text" bind:value={query} placeholder="Search..." />
                </div>
            {/if}
        </div>
        
        <div class="pomodoro-tasks-list">
            {#if Object.keys(groupedTasks).length > 0}
                {#each Object.entries(groupedTasks) as [fileName, taskItems] (fileName)}
                    <div class="task-group">
                        <div class="task-group-header" on:click={() => toggleGroup(fileName)}>
                            <svg class="group-arrow {collapsedGroups[fileName] ? 'is-collapsed' : ''}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            <span>{fileName.replace('.md', '')}</span>
                        </div>

                        {#if !collapsedGroups[fileName]}
                            <div class="task-list-items" transition:slide>
                                {#each taskItems as item (item.blockLink || item.line)}
                                    <div
                                        on:click={() => activeTask(item)}
                                        on:contextmenu={showTaskMenu(item)}
                                        style="background: linear-gradient(to right, rgba(var(--color-green-rgb),0.25) {progress(item)}%, transparent 0%)"
                                        class="pomodoro-tasks-item {item.checked ? 'pomodoro-tasks-checked' : ''}"
                                    >
                                        <div class="pomodoro-tasks-name">
                                            {#if item.checked}
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5" /></svg>
                                            {:else}
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle"><circle cx="12" cy="12" r="10" /></svg>
                                            {/if}
                                            <TaskItemComponent render={r} content={item.description} />
                                        </div>
                                        <div class="pomodoro-tasks-progress">
                                            {progressText(item)}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            {:else if query}
                <div class="pomodoro-tasks-list--empty">No hay tareas que coincidan con tu búsqueda.</div>
            {:else}
                <div class="pomodoro-tasks-list--empty">No se encontraron tareas en el vault.</div>
            {/if}
        </div>
    </div>
</div>

<style>
/* Estilos para el contenedor principal */
.pomodoro-view-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}
/* Estilos para el temporizador */
.pomodoro-timer-container {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid var(--background-modifier-border);
}
.timer-display {
    position: relative;
    width: 120px;
    height: 120px;
    margin-bottom: 10px;
}
.timer-circle-svg {
    transform: rotate(-90deg);
}
.timer-circle-background {
    fill: none;
    stroke: var(--background-modifier-border);
    stroke-width: 5;
}
.timer-circle-progress {
    fill: none;
    stroke: var(--interactive-accent);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s linear;
}
.timer-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 2.2em;
    font-family: var(--font-monospace);
    color: var(--text-normal);
    display: flex;
    align-items: center;
    white-space: nowrap;
}
.timer-colon {
    margin: 0 2px;
    animation: blink 1s infinite;
}
@keyframes blink {
    50% { opacity: 0; }
}
.timer-controls {
    display: flex;
    gap: 15px;
    margin-bottom: 10px;
}
.timer-button {
    background-color: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
}
.timer-button svg {
    width: 20px;
    height: 20px;
}
.timer-button:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
}
.timer-mode {
    font-weight: bold;
    cursor: pointer;
    padding: 5px 10px;
    border-radius: 5px;
}
.timer-mode:hover {
    background-color: var(--background-modifier-hover);
}

/* Estilos para la sección de tareas */
.pomodoro-tasks-wrapper {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: none;
}
.pomodoro-tasks-header, .pomodoro-tasks-text-filter, .pomodoro-tasks-toolbar, .pomodoro-tasks-active {
    flex-shrink: 0;
}
.pomodoro-tasks-list {
    flex-grow: 1;
    overflow-y: auto;
    border-top: 1px solid var(--background-modifier-border);
}
.pomodoro-tasks-list--empty {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
}
.task-group {
    border-bottom: 1px solid var(--background-modifier-border);
}
.task-group:last-child {
    border-bottom: none;
}
.task-group-header {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: var(--background-secondary);
    padding: 0.25rem 1rem;
    font-size: 0.8rem;
    font-weight: bold;
    cursor: pointer;
    position: sticky;
    top: 0;
    z-index: 1;
}
.task-group-header:hover {
    background-color: var(--background-modifier-hover);
}
.group-arrow {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease-in-out;
}
.group-arrow.is-collapsed {
    transform: rotate(-90deg);
}
.task-list-items {
    padding-left: 10px;
}
.pomodoro-tasks-header-title {
    width: 100%;
    padding: 0.5rem 1rem;
    font-size: 1rem; 
    font-weight: bold;
    display: flex;
    justify-content: flex-end; 
    align-items: center; 
}
.pomodoro-tasks-header-title .pomodoro-tasks-count {
    width: auto; 
    padding-right: 5px;
}
.pomodoro-tasks-active {
    border-top: 1px solid var(--background-modifier-border);
    width: 100%;
}
.pomodoro-tasks-item {
    display: flex;
    flex-direction: column; 
    width: 100%;
    padding: 0.5rem 1rem;
}
.pomodoro-tasks-list .pomodoro-tasks-item {
    cursor: pointer; 
}
.pomodoro-tasks-toolbar {
    width: 100%;
}
.pomodoro-tasks-count {
    color: var(--text-faint);
    font-size: 0.8rem;
    text-wrap: nowrap; 
}
.pomodoro-tasks-filters {
    padding: 0.5rem 1rem;
}
.pomodoro-tasks-text-filter {
    border-top: 1px solid var(--background-modifier-border);
    padding: 0.5rem 0rem; 
}
.pomodoro-tasks-wrapper input {
    width: 100%;
    font-size: 0.8rem;
    border: none;
    border-radius: 0;
    background: transparent; 
}
.pomodoro-tasks-wrapper input:active, .pomodoro-tasks-wrapper input:focus {
    border: none;
    box-shadow: none; 
}
.pomodoro-tasks-text-filter input {
    height: 0.8rem;
}
.pomodoro-tasks-filter {
    font-size: 0.8rem;
    padding: 1px 7px;
    border-radius: 10px; 
    cursor: pointer;
    color: var(--text-muted);
}
.pomodoro-tasks-name {
    width: 100%;
    display: flex;
    align-items: center; 
}
.pomodoro-tasks-name svg {
    margin-right: 5px;
    color: var(--color-blue); 
}
.pomodoro-tasks-checked .pomodoro-tasks-name svg {
    color: var(--color-green);
}
.filter-active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent-inverted);
}
.pomodoro-tasks-item + .pomodoro-tasks-item {
    border-top: 1px solid var(--background-modifier-border); 
}
.pomodoro-tasks-checked .pomodoro-tasks-name {
    text-decoration: line-through;
    color: var(--text-muted);
}
.pomodoro-tasks-remove, .pomodoro-tasks-finish {
    cursor: pointer;
    margin-left: 8px;
    display: flex;
    align-items: center;
}
.pomodoro-tasks-finish {
    color: var(--color-green);
}
.pomodoro-tasks-progress {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-align: end;
    text-wrap: nowrap; 
    overflow: hidden;
}
</style>
