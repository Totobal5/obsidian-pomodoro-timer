import { TimerView, VIEW_TYPE_TIMER } from 'TimerView'
import { Notice, Plugin, WorkspaceLeaf, moment } from 'obsidian' // <--- AÑADE "moment" A LA IMPORTACIÓN
import PomodoroSettings, { type Settings } from 'Settings'
import StatusBar from 'StatusBarComponent.svelte'
import Timer from 'Timer'
import Tasks from 'Tasks'
import TaskTracker from 'TaskTracker'
import { extractTaskComponents } from 'utils'
import { StatsView } from './StatsView';

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
        this.registerView('stats-view', (leaf) => new StatsView(leaf, this));

        // ... (ribbon y status bar se mantienen igual)
        this.addRibbonIcon('timer', 'Toggle timer panel', () => {
            let { workspace } = this.app
            let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
            if (leaves.length > 0) {
                workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
            } else {
                this.activateView()
            }
        })

        const status = this.addStatusBarItem()
        status.className = `${status.className} mod-clickable`
        new StatusBar({ target: status, props: { store: this.timer } })


        // ... (los otros comandos se mantienen igual)
        this.addCommand({
            id: 'toggle-timer',
            name: 'Toggle timer',
            callback: () => { this.timer?.toggleTimer() },
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
            callback: () => { this.timer?.reset(); new Notice('Timer reset') },
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
        this.addCommand({
            id: 'view-stats',
            name: 'View pomodoro statistics',
            callback: () => { this.activateStatsView() },
        });

        // --- NUEVO COMANDO DE CORRECCIÓN ---
        this.addCommand({
            id: 'correct-log-times',
            name: 'Correct pomodoro log times',
            callback: async () => {
                await this.correctLogFileTimes();
            }
        });

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                const cursor = editor.getCursor();
                if (cursor.line === 0) return;
                const currentLine = editor.getLine(cursor.line);
                if (currentLine.trim() === '') {
                    const previousLineNumber = cursor.line - 1;
                    const previousLineText = editor.getLine(previousLineNumber);
                    const taskComponents = extractTaskComponents(previousLineText);
                    if (taskComponents && taskComponents.body.trim().length > 0 && !taskComponents.blockLink) {
                        const blockId = ` ^${Math.random().toString(36).substring(2, 6)}`;
                        editor.replaceRange(blockId, { line: previousLineNumber, ch: previousLineText.length });
                    }
                }
            })
        );
    }

    // ... (getSettings y onunload se mantienen igual)
    public getSettings(): Settings {
        return ( this.settingTab?.getSettings() || PomodoroSettings.DEFAULT_SETTINGS )
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
            await leaf.setViewState({ type: VIEW_TYPE_TIMER, active: true })
        }
        workspace.revealLeaf(leaf)
    }
    async activateStatsView() {
        this.app.workspace.detachLeavesOfType('stats-view');
        await this.app.workspace.getRightLeaf(false).setViewState({ type: 'stats-view', active: true });
        this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType('stats-view')[0]);
    }
    
    // --- NUEVA FUNCIÓN DE CORRECCIÓN ---
    async correctLogFileTimes() {
        const settings = this.getSettings();
        if (settings.logFile === 'NONE' || !settings.logPath) {
            new Notice("No hay un archivo de log configurado para corregir.");
            return;
        }

        const logFilePath = settings.logPath.endsWith('.md') ? settings.logPath : `${settings.logPath}.md`;
        const logFile = this.app.vault.getAbstractFileByPath(logFilePath);

        if (!logFile) {
            new Notice(`Archivo de log no encontrado en: ${logFilePath}`);
            return;
        }

        const content = await this.app.vault.read(logFile);
        const lines = content.split('\n');
        let correctedLines = 0;

        const parseDuration = (durationStr: string): number => {
            let totalMinutes = 0;
            const hoursMatch = durationStr.match(/(\d+)\s*h/);
            if (hoursMatch) totalMinutes += parseInt(hoursMatch[1]) * 60;
            const minutesMatch = durationStr.match(/(\d+)\s*m/);
            if (minutesMatch) totalMinutes += parseInt(minutesMatch[1]);
            return totalMinutes;
        };

        const correctedContent = lines.map(line => {
            const regex = /(- 🍅 \(pomodoro::WORK\).*)\(duration::(.*?)\).*\(begin:: (.*?)\) - \(end:: (.*?)\)/;
            const match = line.match(regex);
            
            if (match) {
                const prefix = match[1];
                const durationStr = match[2].trim();
                const beginStr = match[3].trim();
                const endStr = match[4].trim();

                const loggedDuration = parseDuration(durationStr);
                const beginTime = moment(beginStr, "YYYY-MM-DD HH:mm");
                const endTime = moment(endStr, "YYYY-MM-DD HH:mm");
                
                const realDuration = moment.duration(endTime.diff(beginTime)).asMinutes();

                // Condición de corrección: si la duración real es muy corta (ej. < 3 mins)
                // pero la duración registrada es larga (ej. > 20 mins), es un error.
                if (realDuration < 3 && loggedDuration > 20) {
                    const correctedEndTime = beginTime.clone().add(loggedDuration, 'minutes');
                    const correctedEndStr = correctedEndTime.format("YYYY-MM-DD HH:mm");
                    
                    correctedLines++;
                    return `${prefix}(duration:: ${durationStr}) (begin:: ${beginStr}) - (end:: ${correctedEndStr})`;
                }
            }
            return line;
        }).join('\n');

        if (correctedLines > 0) {
            await this.app.vault.modify(logFile, correctedContent);
            new Notice(`¡Se corrigieron ${correctedLines} entradas en el archivo de log!`);
        } else {
            new Notice("No se encontraron errores de tiempo en el archivo de log.");
        }
    }
}