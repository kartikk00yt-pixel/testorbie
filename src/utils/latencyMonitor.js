// Latency Diagnostics & Optimization Module
// Monitors and optimizes bot response times

class LatencyMonitor {
    #metrics = {
        ws_pings: [],
        rest_calls: [],
        command_times: [],
        event_times: [],
    };
    
    #maxSamples = 100;

    /**
     * Record WebSocket latency
     */
    recordWsPing(latencyMs) {
        this.#metrics.ws_pings.push({
            time: Date.now(),
            latency: latencyMs,
        });
        if (this.#metrics.ws_pings.length > this.#maxSamples) {
            this.#metrics.ws_pings.shift();
        }
    }

    /**
     * Record REST call latency
     */
    recordRestCall(latencyMs) {
        this.#metrics.rest_calls.push({
            time: Date.now(),
            latency: latencyMs,
        });
        if (this.#metrics.rest_calls.length > this.#maxSamples) {
            this.#metrics.rest_calls.shift();
        }
    }

    /**
     * Record command execution time
     */
    recordCommand(commandName, latencyMs) {
        this.#metrics.command_times.push({
            time: Date.now(),
            command: commandName,
            latency: latencyMs,
        });
        if (this.#metrics.command_times.length > this.#maxSamples) {
            this.#metrics.command_times.shift();
        }
    }

    /**
     * Record event processing time
     */
    recordEvent(eventName, latencyMs) {
        this.#metrics.event_times.push({
            time: Date.now(),
            event: eventName,
            latency: latencyMs,
        });
        if (this.#metrics.event_times.length > this.#maxSamples) {
            this.#metrics.event_times.shift();
        }
    }

    /**
     * Get latency statistics
     */
    getStats() {
        const calc = (arr) => {
            if (!arr.length) return null;
            const latencies = arr.map(x => x.latency);
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const min = Math.min(...latencies);
            const max = Math.max(...latencies);
            const sorted = [...latencies].sort((a, b) => a - b);
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            return { avg, min, max, p95, count: latencies.length };
        };

        return {
            ws: calc(this.#metrics.ws_pings),
            rest: calc(this.#metrics.rest_calls),
            commands: calc(this.#metrics.command_times),
            events: calc(this.#metrics.event_times),
            timestamp: Date.now(),
        };
    }

    /**
     * Get slowest commands
     */
    getSlowestCommands(limit = 5) {
        return this.#metrics.command_times
            .sort((a, b) => b.latency - a.latency)
            .slice(0, limit);
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.#metrics = {
            ws_pings: [],
            rest_calls: [],
            command_times: [],
            event_times: [],
        };
    }

    /**
     * Check if latency is healthy
     */
    isHealthy() {
        const stats = this.getStats();
        
        // WebSocket should be < 150ms
        if (stats.ws && stats.ws.avg > 150) return false;
        
        // REST should be < 300ms
        if (stats.rest && stats.rest.avg > 300) return false;
        
        // Commands should be < 200ms
        if (stats.commands && stats.commands.p95 > 200) return false;
        
        return true;
    }

    /**
     * Get health report
     */
    getHealthReport() {
        const stats = this.getStats();
        const healthy = this.isHealthy();

        return {
            healthy,
            status: healthy ? '✅ Healthy' : '⚠️ Elevated Latency',
            summary: {
                ws: stats.ws ? `${stats.ws.avg.toFixed(0)}ms (${stats.ws.min}-${stats.ws.max}ms)` : 'No data',
                rest: stats.rest ? `${stats.rest.avg.toFixed(0)}ms (${stats.rest.min}-${stats.rest.max}ms)` : 'No data',
                commands: stats.commands ? `${stats.commands.p95.toFixed(0)}ms p95` : 'No data',
            },
        };
    }
}

// Singleton instance
export const latencyMonitor = new LatencyMonitor();

/**
 * Decorator to measure command execution time
 */
export function measureCommand(commandName) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function(...args) {
            const start = performance.now();
            try {
                return await originalMethod.apply(this, args);
            } finally {
                const duration = performance.now() - start;
                latencyMonitor.recordCommand(commandName, duration);
            }
        };

        return descriptor;
    };
}

/**
 * Measure function execution time
 */
export function measureTime(label, fn) {
    return async function(...args) {
        const start = performance.now();
        try {
            return await fn(...args);
        } finally {
            const duration = performance.now() - start;
            console.log(`[Latency] ${label}: ${duration.toFixed(2)}ms`);
        }
    };
}
