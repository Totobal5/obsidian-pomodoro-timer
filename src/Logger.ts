import { type TimerState, type Mode } from 'Timer'
import * as utils from 'utils'
import PomodoroTimerPlugin from 'main'
import { TFile, Notice, moment } from 'obsidian'
import { type TaskItem } from 'Tasks'

export type TimerLog = {
    duration: number
    begin: number
    end: number
    mode: Mode
    session: number
    task: TaskLog
    finished: boolean
}

export type TaskLog = Pick<
    TaskItem,
    | 'fileName'
    | 'path'
    | 'name'
    | 'text'
    | 'description'
    | 'blockLink'
    | 'actual'
    | 'expected'
    | 'status'
    | 'checked'
    | 'created'
    | 'start'
    | 'scheduled'
    | 'due'
    | 'cancelled'
    | 'priority'
    | 'recurrence'
    | 'tags'
    | 'line'
>

export type LogContext = TimerState & { task: TaskItem }

export default class Logger {
    private plugin: PomodoroTimerPlugin

    constructor(plugin: PomodoroTimerPlugin) {
        this.plugin = plugin
    }

    public async log(ctx: LogContext): Promise<TFile | void> {
        const logFile = await this.resolveLogFile(ctx)
        const log = this.createLog(ctx)

        if (logFile) {
            const logText = await this.toText(log, logFile)
            if (logText) {
                // El código para añadir el log al archivo se mantiene igual
                // ... (código existente para encontrar el block ID y añadir el texto)
                 if (ctx.task && ctx.task.blockLink) {
                    const searchBlockLink = ctx.task.blockLink.trim();
                    if (!searchBlockLink) {
                         new Notice(`Block ID de la tarea vacío o inválido. El log se añadió al final.`);
                         await this.plugin.app.vault.append(logFile, `\n${logText}`);
                         return;
                    }

                    const fileContent = await this.plugin.app.vault.read(logFile);
                    const lines = fileContent.split('\n');
                    let targetLineIndex = -1;

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(`${searchBlockLink}`)) {
                            targetLineIndex = i;
                            break;
                        }
                    }

                    if (targetLineIndex !== -1) {
                        const taskLine = lines[targetLineIndex];
                        const indentationMatch = taskLine.match(/^([	 ]*)-\s\[.?\]/);
                        const baseIndentation = indentationMatch ? indentationMatch[1] : '';
                        let logIndentation = baseIndentation ? baseIndentation + '\t' : '\t';

                        let insertIndex = targetLineIndex + 1;
                        for (let i = targetLineIndex + 1; i < lines.length; i++) {
                            const currentLine = lines[i];
                            if (currentLine.startsWith(logIndentation) && (currentLine.trim().startsWith('-') || currentLine.trim().startsWith('*'))) {
                                insertIndex = i + 1;
                            } else if (currentLine.trim() === '') {
                                insertIndex = i + 1;
                            } else {
                                break;
                            }
                        }
                        
                        lines.splice(insertIndex, 0, logIndentation + logText);
                        const updatedContent = lines.join('\n');
                        await this.plugin.app.vault.modify(logFile, updatedContent);

                    } else {
                        new Notice(`Tarea con block ID ${searchBlockLink} no encontrada. El log se añadió al final.`);
                        await this.plugin.app.vault.append(logFile, `\n${logText}`);
                    }
                } else {
                    new Notice(`No se proporcionó block ID para la tarea. El log se añadió al final.`);
                    await this.plugin.app.vault.append(logFile, `\n${logText}`);
                }
            }
        }
        return logFile
    }

    private async resolveLogFile(ctx: LogContext): Promise<TFile | void> {
        const settings = this.plugin!.getSettings()
        if (settings.logLevel !== 'ALL' && settings.logLevel !== ctx.mode) {
            return
        }
        if (settings.logFocused && ctx.task.path && ctx.task.path.endsWith('md')) {
            const file = this.plugin.app.vault.getAbstractFileByPath(ctx.task.path)
            if (file && file instanceof TFile) { return file }
        }
        if (settings.logFile === 'NONE') {
            return
        }
        if (settings.logFile === 'DAILY') {
            return await utils.getDailyNoteFile()
        }
        if (settings.logFile == 'WEEKLY') {
            return await utils.getWeeklyNoteFile()
        }
        if (settings.logFile === 'FILE') {
            if (settings.logPath) {
                let path = settings.logPath
                if (!path.endsWith('md')) {
                    path += '.md'
                }
                try {
                    return await utils.ensureFileExists(this.plugin.app, path)
                } catch (error) {
                    if (error instanceof Error) {
                        new Notice(error.message)
                    }
                    return
                }
            }
        }
    }

    private createLog(ctx: LogContext): TimerLog {
        return {
            mode: ctx.mode,
            duration: Math.floor(ctx.elapsed / 60000),
            begin: ctx.startTime!,
            end: new Date().getTime(),
            session: ctx.duration,
            task: ctx.task,
            finished: ctx.count == ctx.elapsed,
        }
    }

    private async toText(log: TimerLog, file: TFile): Promise<string> {
        const settings = this.plugin.getSettings()
        if (
            settings.logFormat === 'CUSTOM' &&
            utils.getTemplater(this.plugin.app)
        ) {
            try {
                return await utils.parseWithTemplater(
                    this.plugin.app,
                    file,
                    settings.logTemplate,
                    log,
                )
            } catch (e) {
                new Notice('Invalid template')
                console.error('invalid templat:', e)
                return ''
            }
        } else {
            // --- CAMBIO CLAVE ---
            // Solo se omite el log si es un DESCANSO no terminado.
            // Las sesiones de TRABAJO siempre se registran.
            if (!log.finished && log.mode === 'BREAK') {
                return ''
            }

            let begin = moment(log.begin)
            let end = moment(log.end)
            if (settings.logFormat === 'SIMPLE') {
                return `**${log.mode}(${log.duration}m)**: ${begin.format(
                    'HH:mm',
                )} - ${end.format('HH:mm')}`
            }

            if (settings.logFormat === 'VERBOSE') {
                const taskId = log.task.blockLink ? log.task.blockLink.replace('^', '') : 'N/A';
                const emoji = log.mode == 'WORK' ? '🍅' : '🥤'
                return `- ${emoji} (pomodoro::${log.mode}) (taskID:: ${taskId}) (duration:: ${
                    log.duration
                }m) (begin:: ${begin.format(
                    'YYYY-MM-DD HH:mm',
                )}) - (end:: ${end.format('YYYY-MM-DD HH:mm')})`
            }

            return ''
        }
    }
}