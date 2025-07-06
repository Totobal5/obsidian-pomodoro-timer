import { ItemView, WorkspaceLeaf } from 'obsidian';
import PomodoroTimerPlugin from 'main';
import StatsViewComponent from './StatsViewComponent.svelte';

export class StatsView extends ItemView {
    plugin: PomodoroTimerPlugin;
    
    constructor(leaf: WorkspaceLeaf, plugin: PomodoroTimerPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return 'stats-view';
    }

    getDisplayText() {
        return 'Pomodoro Stats';
    }

    getIcon() {
        return 'line-chart'; // Un ícono apropiado para las estadísticas
    }

    async onOpen() {
        new StatsViewComponent({
            target: this.contentEl,
            props: {
                plugin: this.plugin,
            },
        });
    }
}