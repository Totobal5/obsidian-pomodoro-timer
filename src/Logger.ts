import { type TimerState, type Mode } from 'Timer'
import * as utils from 'utils'
import PomodoroTimerPlugin from 'main'
import { TFile, Notice, moment, EditorPosition, Editor, MarkdownView } from 'obsidian'
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
                // --- DEBUG LOGGING ---
                console.log("--- DEBUG LOGGING ---");
                console.log("Log file:", logFile.path);
                console.log("Task info from context:", ctx.task);
                const cleanBlockLink = ctx.task?.blockLink ? ctx.task.blockLink.trim() : null;
                console.log("Expected blockLink (cleaned, as is):", cleanBlockLink ? `${cleanBlockLink}` : "N/A (no blockLink in context)");
                console.log("Log text to insert:", logText);
                // --- FIN DE DEPURACIÓN ---

                if (ctx.task && ctx.task.blockLink) {
                    const searchBlockLink = ctx.task.blockLink.trim();
                    if (!searchBlockLink) {
                         new Notice(`Block ID de la tarea vacío o inválido. El log se añadió al final.`);
                         console.warn(`WARNING: Cleaned blockLink for task is empty. Log appended to end.`);
                         await this.plugin.app.vault.append(logFile, `\n${logText}`);
                         return;
                    }

                    const fileContent = await this.plugin.app.vault.read(logFile);
                    const lines = fileContent.split('\n');

                    let targetLineIndex = -1;

                    // --- DEPURACIÓN DE BÚSQUEDA DE TAREA ---
                    console.log("Total lines in file:", lines.length);
                    if (ctx.task.line !== undefined && lines[ctx.task.line] && lines[ctx.task.line].includes(`${searchBlockLink}`)) {
                        targetLineIndex = ctx.task.line;
                        console.log(`Found task by exact line number (${ctx.task.line}) and cleaned blockLink.`);
                    } else {
                        console.log(`Task not found at reported line ${ctx.task.line} or blockLink mismatch. Searching linearly with cleaned blockLink...`);
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].includes(`${searchBlockLink}`)) {
                                targetLineIndex = i;
                                console.log(`Found task by linear search at line: ${i}`);
                                break;
                            }
                        }
                    }
                    console.log("Final targetLineIndex (tarea principal):", targetLineIndex);
                    // --- FIN DE DEPURACIÓN DE BÚSQUEDA DE TAREA ---


                    if (targetLineIndex !== -1) {
                        const taskLine = lines[targetLineIndex];
                        console.log("Task line found:", taskLine);

                        const indentationMatch = taskLine.match(/^([	 ]*)-\s\[.?\]/);
                        const baseIndentation = indentationMatch ? indentationMatch[1] : '';

                        let logIndentation: string;
                        if (baseIndentation.trim() === '') {
                            logIndentation = '\t';
                        } else {
                            logIndentation = baseIndentation + '\t';
                        }

                        console.log("Calculated baseIndentation (de la tarea):", JSON.stringify(baseIndentation));
                        console.log("Calculated logIndentation (para el log):", JSON.stringify(logIndentation));

                        let insertIndex = targetLineIndex + 1;

                        for (let i = targetLineIndex + 1; i < lines.length; i++) {
                            const currentLine = lines[i];

                            if (currentLine.startsWith(logIndentation) && (currentLine.trim().startsWith('-') || currentLine.trim().startsWith('*'))) {
                                insertIndex = i + 1;
                            } else if (currentLine.trim() === '') {
                                insertIndex = i + 1;
                            } else {
                                console.log(`Found end of indented block at line ${i}. Breaking loop.`);
                                break;
                            }
                        }
                        console.log("Final insertIndex (para el nuevo log):", insertIndex);

                        lines.splice(insertIndex, 0, logIndentation + logText);
                        const updatedContent = lines.join('\n');
                        await this.plugin.app.vault.modify(logFile, updatedContent);

                        const activeLeaf = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
                        if (activeLeaf && activeLeaf.view instanceof MarkdownView && activeLeaf.view.file === logFile) {
                            const editor = activeLeaf.view.editor;
                            editor.setCursor({line: insertIndex, ch: (logIndentation + logText).length});
                        }

                    } else {
                        new Notice(`Tarea con block ID ${searchBlockLink} no encontrada en el archivo. El log se añadió al final.`);
                        console.error(`ERROR: Task with block ID ${searchBlockLink} not found in file ${logFile.path}. Log appended to end.`);
                        await this.plugin.app.vault.append(logFile, `\n${logText}`);
                    }
                } else {
                    new Notice(`No se proporcionó block ID para la tarea. El log se añadió al final.`);
                    console.warn(`WARNING: No task or blockLink provided for logging. Log appended to end.`);
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
            if (!log.finished) {
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
                // CAMBIO CLAVE: Espacio después de "(taskID:: ${taskId})"
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