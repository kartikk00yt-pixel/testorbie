// Performance Optimizer - Reduce Bot Latency & Response Time
// Caches frequently accessed data in memory to avoid repeated file I/O

class PerformanceOptimizer {
    #cache = new Map(); // In-memory cache for frequently accessed data
    #cacheExpiry = new Map(); // Cache expiration times
    #cacheTimeout = 5 * 60 * 1000; // 5 minute default TTL

    /**
     * Set cache with automatic expiration
     */
    setCache(key, value, ttlMs = this.#cacheTimeout) {
        this.#cache.set(key, value);
        
        // Set expiration timeout
        if (this.#cacheExpiry.has(key)) {
            clearTimeout(this.#cacheExpiry.get(key));
        }
        
        const timeout = setTimeout(() => {
            this.#cache.delete(key);
            this.#cacheExpiry.delete(key);
        }, ttlMs);
        timeout.unref?.();
        
        this.#cacheExpiry.set(key, timeout);
    }

    /**
     * Get from cache
     */
    getCache(key) {
        return this.#cache.get(key);
    }

    /**
     * Check if key is cached
     */
    hasCache(key) {
        return this.#cache.has(key);
    }

    /**
     * Clear specific cache entry
     */
    clearCache(key) {
        if (this.#cacheExpiry.has(key)) {
            clearTimeout(this.#cacheExpiry.get(key));
            this.#cacheExpiry.delete(key);
        }
        this.#cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clearAllCache() {
        for (const timeout of this.#cacheExpiry.values()) {
            clearTimeout(timeout);
        }
        this.#cache.clear();
        this.#cacheExpiry.clear();
    }

    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            entries: this.#cache.size,
            keys: Array.from(this.#cache.keys()),
        };
    }
}

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
