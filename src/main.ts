import { TimerView, VIEW_TYPE_TIMER } from 'TimerView'
import { Notice, Plugin, WorkspaceLeaf, moment, TFile } from 'obsidian'
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

        this.app.workspace.onLayoutReady(() => {
            this.tasks?.loadAllVaultTasks();
        });

        this.registerView(VIEW_TYPE_TIMER, (leaf) => new TimerView(this, leaf))
        this.registerView('stats-view', (leaf) => new StatsView(leaf, this));

        this.addRibbonIcon('timer', 'Toggle timer panel', () => {
            this.activateView()
        })

        const status = this.addStatusBarItem()
        status.className = `${status.className} mod-clickable`
        new StatusBar({ target: status, props: { store: this.timer } })

        this.addCommand({
            id: 'toggle-timer',
            name: 'Toggle timer',
            callback: () => { this.timer?.toggleTimer() },
        })
        this.addCommand({
            id: 'toggle-timer-panel',
            name: 'Toggle timer panel',
            callback: () => {
                this.activateView()
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

    public getSettings(): Settings {
        return ( this.settingTab?.getSettings() || PomodoroSettings.DEFAULT_SETTINGS )
    }

    public updateSettings(newSettings: Partial<Settings>) {
        this.settingTab?.updateSettings(newSettings);
    }

    onunload() {
        this.settingTab?.unload()
        this.timer?.destroy()
        this.tasks?.destroy()
        this.tracker?.destory()
    }
    async activateView() {
        let { workspace } = this.app
        let leaves = workspace.getLeavesOfType(VIEW_TYPE_TIMER)
        if (leaves.length > 0) {
            workspace.detachLeavesOfType(VIEW_TYPE_TIMER)
            return;
        }
        
        let leaf = workspace.getLeftLeaf(false)
        await leaf.setViewState({ type: VIEW_TYPE_TIMER, active: true })
        workspace.revealLeaf(leaf)
    }
    async activateStatsView() {
        this.app.workspace.detachLeavesOfType('stats-view');
        await this.app.workspace.getRightLeaf(false).setViewState({ type: 'stats-view', active: true });
        this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType('stats-view')[0]);
    }
    
    async correctLogFileTimes() {
        const settings = this.getSettings();
        if (settings.logFile === 'NONE' || !settings.logPath) {
            new Notice("No hay un archivo de log configurado para corregir.");
            return;
        }

        const logFilePath = settings.logPath.endsWith('.md') ? settings.logPath : `${settings.logPath}.md`;
        const logAbstractFile = this.app.vault.getAbstractFileByPath(logFilePath);

        if (!logAbstractFile) {
            new Notice(`Archivo de log no encontrado en: ${logFilePath}`);
            return;
        }

        // --- CAMBIO CLAVE: Verificar que sea una instancia de TFile ---
        if (!(logAbstractFile instanceof TFile)) {
            new Notice(`La ruta del log no es un archivo válido: ${logFilePath}`);
            return;
        }

        const logFile = logAbstractFile; // Ahora es de tipo TFile

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
