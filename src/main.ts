import { TimerView, VIEW_TYPE_TIMER } from 'TimerView'
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian'
import PomodoroSettings, { type Settings } from 'Settings'
import StatusBar from "StatusBarComponent.svelte"
import Timer from 'Timer'
import Tasks from 'Tasks'
import TaskTracker from 'TaskTracker'
import { extractTaskComponents } from 'utils'

export default class PomodoroTimerPlugin extends Plugin {
    private settingTab?: PomodoroSettings

    public timer?: Timer

    public tasks?: Tasks

    public tracker?: TaskTracker

    async onload() {
        const settings = await this.loadData()
        this.settingTab = new PomodoroSettings(this, settings)
        this.addSettingTab(this.settingTab)
        this.tracker = new TaskTracker(this)
        this.timer = new Timer(this)
        this.tasks = new Tasks(this)

        this.registerView(VIEW_TYPE_TIMER, (leaf) => new TimerView(this, leaf))

        // ribbon
        this.addRibbonIcon('timer', 'Toggle timer panel', () => {
            let { workspace } = this.app
            let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
            if (leaves.length > 0) {
                workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
            } else {
                this.activateView()
            }
        })

        // status bar
        const status = this.addStatusBarItem()
        status.className = `${status.className} mod-clickable`
        new StatusBar({ target: status, props: { store: this.timer } })

        // commands
        this.addCommand({
            id: 'toggle-timer',
            name: 'Toggle timer',
            callback: () => {
                this.timer?.toggleTimer()
            },
        })

        this.addCommand({
            id: 'toggle-timer-panel',
            name: 'Toggle timer panel',
            callback: () => {
                let { workspace } = this.app
                let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
                if (leaves.length > 0) {
                    workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
                } else {
                    this.activateView()
                }
            },
        })

        this.addCommand({
            id: 'reset-timer',
            name: 'Reset timer',
            callback: () => {
                this.timer?.reset()
                new Notice('Timer reset')
            },
        })

        this.addCommand({
            id: 'toggle-mode',
            name: 'Toggle timer mode',
            callback: () => {
                this.timer?.toggleMode((t) => {
                    new Notice(`Timer mode: ${t.mode}`)
                })
            },
        })

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                const cursor = editor.getCursor();

                // Si el cursor está en la primera línea, no hay nada que hacer
                if (cursor.line === 0) {
                    return;
                }

                const currentLine = editor.getLine(cursor.line);

                // Se activa solo si el usuario acaba de presionar Enter y está en una línea nueva y vacía
                if (currentLine.trim() === '') {
                    const previousLineNumber = cursor.line - 1;
                    const previousLineText = editor.getLine(previousLineNumber);

                    // Se utiliza la función importada para verificar si la línea es una tarea
                    const taskComponents = extractTaskComponents(previousLineText);

                    // Si la línea anterior es una tarea con texto y sin un ID de bloque...
                    if (taskComponents && taskComponents.body.trim().length > 0 && !taskComponents.blockLink) {
                        const blockId = ` ^${Math.random().toString(36).substring(2, 6)}`;

                        // Se añade el ID de bloque al final de la línea anterior
                        editor.replaceRange(blockId, { line: previousLineNumber, ch: previousLineText.length });
                    }
                }
            })
        );        
    }

    public getSettings(): Settings {
        return (
            this.settingTab?.getSettings() || PomodoroSettings.DEFAULT_SETTINGS
        )
    }

    onunload() {
        this.settingTab?.unload()
        this.timer?.destroy()
        this.tasks?.destroy()
        this.tracker?.destory()
    }
    async activateView() {
        let { workspace } = this.app

        let leaf: WorkspaceLeaf | null = null
        let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)

        if (leaves.length > 0) {
            leaf = leaves[0]
        } else {
            leaf = workspace.getRightLeaf(false)
            await leaf.setViewState({
                type: VIEW_TYPE_TIMER,
                active: true,
            })
        }

        workspace.revealLeaf(leaf)
    }
}
