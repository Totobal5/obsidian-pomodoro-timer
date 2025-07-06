import PomodoroTimerPlugin from 'main'
import { type CachedMetadata, type TFile } from 'obsidian'
import { extractTaskComponents } from 'utils'
import { writable, type Readable, type Writable } from 'svelte/store'
import type { TaskFormat } from 'Settings'
import type { Unsubscriber } from 'svelte/motion'
import { DESERIALIZERS } from 'serializer'

export type TaskItem = {
    path: string
    text: string
    fileName: string
    name: string
    status: string
    blockLink: string
    checked: boolean
    done: string
    due: string
    created: string
    cancelled: string
    scheduled: string
    start: string
    description: string
    priority: string
    recurrence: string
    expected: number
    actual: number
    tags: string[]
    line: number
}

export type TaskStore = {
    list: TaskItem[]
}

export default class Tasks implements Readable<TaskStore> {
    private plugin: PomodoroTimerPlugin

    private _store: Writable<TaskStore>

    public subscribe

    private unsubscribers: Unsubscriber[] = []

    private state: TaskStore = {
        list: [],
    }

    public static getDeserializer(format: TaskFormat) {
        return DESERIALIZERS[format]
    }

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
        this._store = writable(this.state)
        this.subscribe = this._store.subscribe

        this.unsubscribers.push(
            this._store.subscribe((state) => {
                this.state = state
            }),
        )

        // La carga inicial ahora se activará desde main.ts cuando el layout esté listo.

        // Escucha los cambios en los metadatos de los archivos para actualizar las tareas dinámicamente
        this.plugin.registerEvent(
            plugin.app.metadataCache.on(
                'changed',
                (file: TFile, data: string, cache: CachedMetadata) => {
                    this.updateTasksFromFile(file, data, cache);
                },
            ),
        )
    }

    public updateTasksFromFile(file: TFile, content: string, metadata: CachedMetadata) {
        const newTasks = resolveTasks(
            this.plugin.getSettings().taskFormat,
            file,
            content,
            metadata
        );

        this._store.update((state) => {
            const otherTasks = state.list.filter(task => task.path !== file.path);
            state.list = [...otherTasks, ...newTasks];
            return state;
        });

        if (this.plugin.tracker?.task?.blockLink) {
            let task = newTasks.find(
                (item) =>
                    item.blockLink &&
                    item.blockLink ===
                        this.plugin.tracker?.task?.blockLink,
            );
            if (task) {
                this.plugin.tracker.sync(task)
            }
        }
    }


    public async loadAllVaultTasks() {
        const allMarkdownFiles = this.plugin.app.vault.getMarkdownFiles();
        let allTasks: TaskItem[] = [];

        for (const file of allMarkdownFiles) {
            try {
                const content = await this.plugin.app.vault.cachedRead(file);
                const metadata = this.plugin.app.metadataCache.getFileCache(file);
                if (metadata) { // Asegurarse de que los metadatos están disponibles
                    const tasksInFile = resolveTasks(
                        this.plugin.getSettings().taskFormat,
                        file,
                        content,
                        metadata
                    );
                    allTasks.push(...tasksInFile);
                }
            } catch (e) {
                console.error(`Error procesando el archivo ${file.path}:`, e);
            }
        }

        this._store.update((state) => {
            state.list = allTasks;
            return state;
        });
    }

    public clearTasks() {
        this._store.update(() => ({
            list: [],
        }))
    }

    public destroy() {
        for (let unsub of this.unsubscribers) {
            unsub()
        }
    }
}

export function resolveTasks(
    format: TaskFormat,
    file: TFile,
    content: string,
    metadata: CachedMetadata | null,
): TaskItem[] {
    if (!content || !metadata) {
        return []
    }

    let cache: Record<number, TaskItem> = {}
    const lines = content.split('\n')
    for (let rawElement of metadata.listItems || []) {
        if (rawElement.task) {
            let lineNr = rawElement.position.start.line
            let line = lines[lineNr]

            const components = extractTaskComponents(line)
            if (!components) {
                continue
            }
            let detail = DESERIALIZERS[format].deserialize(components.body)

            let [actual, expected] = detail.pomodoros.split('/')

            const dateformat = 'YYYY-MM-DD'
            let item: TaskItem = {
                text: line,
                path: file.path,
                fileName: file.name,
                name: detail.description,
                status: components.status,
                blockLink: components.blockLink,
                checked: rawElement.task != '' && rawElement.task != ' ',
                description: detail.description,
                done: detail.doneDate?.format(dateformat) ?? '',
                due: detail.dueDate?.format(dateformat) ?? '',
                created: detail.createdDate?.format(dateformat) ?? '',
                cancelled: detail.cancelledDate?.format(dateformat) ?? '',
                scheduled: detail.scheduledDate?.format(dateformat) ?? '',
                start: detail.startDate?.format(dateformat) ?? '',
                priority: detail.priority,
                recurrence: detail.recurrenceRule,
                expected: expected ? parseInt(expected) : 0,
                actual: actual === '' ? 0 : parseInt(actual),
                tags: detail.tags,
                line: lineNr,
            }

            cache[lineNr] = item
        }
    }

    return Object.values(cache)
}
