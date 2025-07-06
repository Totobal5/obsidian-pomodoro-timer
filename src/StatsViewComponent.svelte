<script lang="ts">
    import type PomodoroTimerPlugin from "main";
    import { onMount } from "svelte";

    export let plugin: PomodoroTimerPlugin;

    let dailyStats: { [date: string]: number } = {};
    let totalPomodoros = 0;
    let longestStreak = 0;
    let currentStreak = 0;
    let totalTimeFocused = "0h 0m";
    
    // NUEVO: Función mejorada para convertir "1h 25m" a minutos
    function parseDurationToMinutes(durationStr: string): number {
        let totalMinutes = 0;
        
        // Buscamos las horas
        const hoursMatch = durationStr.match(/(\d+)\s*h/);
        if (hoursMatch) {
            totalMinutes += parseInt(hoursMatch[1]) * 60;
        }

        // Buscamos los minutos
        const minutesMatch = durationStr.match(/(\d+)\s*m/);
        if (minutesMatch) {
            totalMinutes += parseInt(minutesMatch[1]);
        }
        
        return totalMinutes;
    }

    async function processLogs() {
        const settings = plugin.getSettings();
        if (settings.logFile === 'NONE' || !settings.logPath) {
            return;
        }

        const logFilePath = settings.logPath.endsWith('.md') ? settings.logPath : `${settings.logPath}.md`;
        const logFile = plugin.app.vault.getAbstractFileByPath(logFilePath);

        if (!logFile) {
            console.error("No se encontró el archivo de log.");
            return;
        }

        const content = await plugin.app.vault.read(logFile);
        const lines = content.split('\n');
        
        const stats: { [date: string]: number } = {};
        const pomodoroDates = new Set<string>();
        let totalMinutes = 0;

        // NUEVO: Regex mejorado para capturar cualquier texto de duración
        const logRegex = /- 🍅 \(pomodoro::WORK\).*\(duration::(.*?)\).*\(end:: ([\d-]{10})/;

        for (const line of lines) {
            const match = line.match(logRegex);
            if (match) {
                // Usamos la nueva función para convertir la duración a minutos
                const durationInMinutes = parseDurationToMinutes(match[1]);
                const date = match[2];
                
                totalMinutes += durationInMinutes;

                // Para el conteo de "pomodoros", seguimos considerando los ciclos completos
                if (durationInMinutes >= settings.workLen) {
                    stats[date] = (stats[date] || 0) + 1;
                    pomodoroDates.add(date);
                }
            }
        }
        
        // ... (la lógica para las rachas se mantiene igual)
        const sortedDates = Array.from(pomodoroDates).sort();
        let streak = 0;
        let maxStreak = 0;
        
        if (sortedDates.length > 0) {
            streak = 1;
            maxStreak = 1;
            let today = new Date().toISOString().slice(0, 10);
            
            for (let i = 1; i < sortedDates.length; i++) {
                const prevDate = new Date(sortedDates[i-1]);
                const currDate = new Date(sortedDates[i]);
                const diffTime = currDate.getTime() - prevDate.getTime();
                const diffDays = diffTime / (1000 * 3600 * 24);

                if (diffDays === 1) {
                    streak++;
                } else {
                    maxStreak = Math.max(maxStreak, streak);
                    streak = 1;
                }
            }
            maxStreak = Math.max(maxStreak, streak);

            if (sortedDates.includes(today)) {
                let current = 1;
                for(let i = sortedDates.length - 1; i > 0; i--) {
                    const prevDate = new Date(sortedDates[i-1]);
                    const currDate = new Date(sortedDates[i]);
                    if ((currDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24) === 1) {
                        current++;
                    } else {
                        break;
                    }
                }
                currentStreak = current;
            } else {
                currentStreak = 0;
            }
        }
        
        dailyStats = stats;
        totalPomodoros = Object.values(stats).reduce((a, b) => a + b, 0);
        longestStreak = maxStreak;

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        totalTimeFocused = `${hours}h ${minutes}m`;
    }

    onMount(processLogs);

    const maxDailyCount = () => Math.max(1, ...Object.values(dailyStats));
</script>

<div class="stats-view">
    <div class="stats-header">
        <h1>Estadísticas de Pomodoro</h1>
    </div>

    <div class="stats-summary">
        <div class="stat-card">
            <div class="stat-value">{totalPomodoros}</div>
            <div class="stat-label">Pomodoros Totales</div>
        </div>
        
        <div class="stat-card">
            <div class="stat-value">{totalTimeFocused}</div>
            <div class="stat-label">Tiempo de Enfoque</div>
        </div>

        <div class="stat-card">
            <div class="stat-value">{longestStreak} días</div>
            <div class="stat-label">Mejor Racha</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">{currentStreak} días</div>
            <div class="stat-label">Racha Actual 🔥</div>
        </div>
    </div>

    <div class="stats-chart">
        <h2>Actividad de los Últimos Días</h2>
        <div class="chart-container">
            {#each Object.entries(dailyStats).slice(-30) as [date, count]}
                <div class="chart-bar-wrapper" title="{count} pomodoros el {date}">
                    <div class="chart-bar" style="height: {(count / maxDailyCount()) * 100}%;"></div>
                    <div class="chart-label">{new Date(date).getDate()}</div>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    /* Los estilos se mantienen igual */
    .stats-view {
        padding: 1.5rem;
        height: 100%;
        overflow-y: auto;
    }
    .stats-header h1 {
        margin-bottom: 2rem;
        text-align: center;
    }
    .stats-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 1rem;
        margin-bottom: 3rem;
    }
    .stat-card {
        background-color: var(--background-secondary);
        padding: 1rem;
        border-radius: 8px;
        text-align: center;
    }
    .stat-value {
        font-size: 2em;
        font-weight: bold;
        color: var(--text-accent);
    }
    .stat-label {
        font-size: 0.9em;
        color: var(--text-muted);
    }
    .stats-chart h2 {
        margin-bottom: 1.5rem;
    }
    .chart-container {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        height: 150px;
        width: 100%;
        border-bottom: 1px solid var(--background-modifier-border);
        padding-bottom: 5px;
    }
    .chart-bar-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
    }
    .chart-bar {
        width: 70%;
        background-color: var(--interactive-accent);
        border-radius: 4px 4px 0 0;
        transition: height 0.3s ease-out;
    }
    .chart-label {
        font-size: 0.7em;
        margin-top: 5px;
        color: var(--text-faint);
    }
</style>