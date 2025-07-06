import { ItemView, WorkspaceLeaf } from 'obsidian'
// CAMBIO: Asegúrate de que el nombre del componente importado coincida con tu archivo
import TasksComponent from './TasksComponent.svelte' 
import PomodoroTimerPlugin from 'main'
import { MarkdownRenderer } from 'obsidian'

export const VIEW_TYPE_TIMER = 'timer-view'

export class TimerView extends ItemView {
    private component?: TasksComponent // El tipo también debe coincidir
    private plugin

    constructor(plugin: PomodoroTimerPlugin, leaf: WorkspaceLeaf) {
        super(leaf)
        this.plugin = plugin
        this.icon = 'timer'
    }

    getViewType(): string {
        return VIEW_TYPE_TIMER
    }

    getDisplayText(): string {
        return 'Timer'
    }

    async onOpen() {
        this.component = new TasksComponent({
            target: this.contentEl,
            props: {
                // Aseguramos que se pasen todos los props necesarios
                timer: this.plugin.timer,
                tasks: this.plugin.tasks,
                tracker: this.plugin.tracker,
                render: (content: string, el: HTMLElement) => {
                    MarkdownRenderer.render(
                        this.plugin.app,
                        content,
                        el,
                        '',
                        this,
                    )
                }
            },
        })
    }

    async onClose() {
        this.component?.$destroy()
    }
}