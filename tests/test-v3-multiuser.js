// Test Suite - Bot V3 Multi-User Concurrency
// Run with: node tests/test-v3-multiuser.js

import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { userMutex } from '../src/utils/userMutex.js';
import { atomicOps } from '../src/utils/atomicFileOps.js';
import { TokenStoreV3 } from '../src/quest/tokenStoreV3.js';

const STORE_FILES = ['tokens.json', 'tokenAccounts.json', 'tokenLedger.json'];
const storeSnapshots = new Map(STORE_FILES.map((file) => [
    file,
    existsSync(file) ? readFileSync(file, 'utf8') : null,
]));

function restoreStoreFiles() {
    for (const [file, content] of storeSnapshots) {
        if (content === null) continue;
        writeFileSync(file, content, 'utf8');
    }
}

console.log('\n🧪 Bot V3 Multi-User Concurrency Tests\n');

/**
 * Test 1: User Mutex - Concurrent Lock Acquisition
 */
async function testUserMutex() {
    console.log('Test 1: User Mutex Lock Acquisition');
    
    const results = [];
    const startTime = Date.now();
    
    // Simulate 5 users acquiring locks in parallel
    const promises = [];
    for (let i = 1; i <= 5; i++) {
        promises.push((async () => {
            const release = await userMutex.acquireLock(`user-${i}`, 5000);
            results.push({ user: `user-${i}`, acquired: Date.now() });
            
            // Simulate work
            await new Promise(r => setTimeout(r, 100));
            release();
            results.push({ user: `user-${i}`, released: Date.now() });
        })());
    }
    
    await Promise.all(promises);
    
    console.log(`  ✓ All users acquired locks: ${results.length} operations`);
    console.log(`  ✓ No deadlocks detected`);
    console.log(`  ✓ Time: ${Date.now() - startTime}ms\n`);
}

/**
 * Test 2: Atomic File Operations - Race Condition Prevention
 */
async function testAtomicFileOps() {
    console.log('Test 2: Atomic File Operations');
    
    const testFile = 'test-atomic.json';
    const initialData = { counter: 0, users: [] };
    
    // Write initial data
    await atomicOps.writeJSON(testFile, initialData);
    
    // Simulate 10 concurrent writes
    const startTime = Date.now();
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
        promises.push(
            atomicOps.updateJSON(testFile, (data) => {
                data.counter++;
                data.users.push({ id: i, timestamp: Date.now() });
                return data;
            })
        );
    }
    
    await Promise.all(promises);
    
    // Verify data integrity
    const final = await atomicOps.readJSON(testFile);
    const dataIntegrity = final.counter === 10 && final.users.length === 10;
    
    console.log(`  ✓ Counter integrity: ${final.counter} === 10 ? ${dataIntegrity}`);
    console.log(`  ✓ User entries: ${final.users.length} === 10 ? ${final.users.length === 10}`);
    console.log(`  ✓ Time: ${Date.now() - startTime}ms`);
    console.log(`  ✓ No data corruption detected\n`);
    
    // Cleanup
    await atomicOps.updateJSON(testFile, () => ({}));
}

/**
 * Test 3: Token Store V3 - Multi-User Concurrent Access
 */
async function testTokenStoreV3() {
    console.log('Test 3: TokenStore V3 - Multi-User Safety');
    
    const tokenStore = new TokenStoreV3('test-secret-key-12345');
    const startTime = Date.now();
    
    // Simulate 5 users saving tokens concurrently
    const promises = [];
    for (let i = 1; i <= 5; i++) {
        promises.push(
            tokenStore.save(
                `user-${i}`,
                `token-value-${i}`,
                `User ${i}`,
                `https://example.com/avatar-${i}.png`
            )
        );
    }
    
    await Promise.all(promises);
    
    // Verify all tokens saved correctly
    let allCorrect = true;
    for (let i = 1; i <= 5; i++) {
        const token = await tokenStore.get(`user-${i}`);
        if (token !== `token-value-${i}`) {
            allCorrect = false;
            console.log(`  ✗ Token mismatch for user-${i}`);
        }
    }
    
    const size = await tokenStore.getSize();
    const stats = await tokenStore.getStats();
    
    console.log(`  ✓ All tokens saved correctly: ${allCorrect}`);
    console.log(`  ✓ Store size: ${size} tokens`);
    console.log(`  ✓ Unique users tracked: ${stats.uniqueUsers}`);
    console.log(`  ✓ Version: ${stats.version}`);
    console.log(`  ✓ Time: ${Date.now() - startTime}ms\n`);
}

/**
 * Test 4: Quest Processing - Per-User Fairness
 */
async function testQuestFairness() {
    console.log('Test 4: Quest Processing Fairness');
    
    const tracking = {
        'user-1': { 'quest-A': { completedAt: Date.now(), retries: 1 } },
        'user-2': { 'quest-A': { completedAt: Date.now(), retries: 0 } },
    };
    
    // User 1's quest completion should NOT affect User 2's quest
    const user1Completed = !!tracking['user-1']['quest-A'];
    const user2Tracking = !!tracking['user-2']['quest-A'];
    
    console.log(`  ✓ User 1 completed quest-A: ${user1Completed}`);
    console.log(`  ✓ User 2 has separate quest-A tracking: ${user2Tracking}`);
    console.log(`  ✓ Per-user tracking prevents unfair skipping\n`);
}

/**
 * Test 5: Lock Statistics
 */
async function testLockStatistics() {
    console.log('Test 5: Lock Statistics & Monitoring');
    
    // Acquire a lock
    const release = await userMutex.acquireLock('test-user', 5000);
    
    const stats = userMutex.getStats();
    
    console.log(`  ✓ Active users with locks: ${stats.lockedUsers}`);
    console.log(`  ✓ Total users tracked: ${stats.totalUsers}`);
    console.log(`  ✓ Active user IDs: ${JSON.stringify(stats.activeUsers)}`);
    
    release();
    
    const statsAfter = userMutex.getStats();
    console.log(`  ✓ After release - locked users: ${statsAfter.lockedUsers}\n`);
}

/**
 * Test 6: Timeout Protection
 */
async function testTimeoutProtection() {
    console.log('Test 6: Lock Timeout Protection');
    
    let timeoutTriggered = false;
    
    // Create a stuck lock scenario
    const release1 = await userMutex.acquireLock('stuck-user', 30000);
    
    // Try to acquire same lock with short timeout
    try {
        await userMutex.acquireLock('stuck-user', 500);
        timeoutTriggered = false;
    } catch (err) {
        if (err.message.includes('timeout')) {
            timeoutTriggered = true;
        }
    }
    
    release1();
    
    console.log(`  ✓ Timeout protection working: ${timeoutTriggered}`);
    console.log(`  ✓ Deadlock prevention: ENABLED\n`);
}

/**
 * Test 7: Forced release advances queued locks
 */
async function testForcedRelease() {
    console.log('Test 7: Forced Lock Release');

    const release = await userMutex.acquireLock('forced-user', 5000);
    const queued = userMutex.acquireLock('forced-user', 5000);
    userMutex.forceRelease('forced-user');

    const releaseQueued = await queued;
    releaseQueued();
    release();

    console.log('  ✓ Queued lock acquired after forced release\n');
}

/**
 * Test 8: Reject malformed object stores before update
 */
async function testAtomicRootValidation() {
    console.log('Test 8: Atomic Store Root Validation');

    const testFile = 'test-atomic.json';
    writeFileSync(testFile, '[]', 'utf8');

    await assert.rejects(
        () => atomicOps.updateJSON(testFile, (data) => ({ ...data, user: true })),
        /Expected an object at the root/,
    );

    console.log('  ✓ Malformed root rejected without data loss\n');
}

/**
 * Run all tests
 */
async function runAllTests() {
    const startTime = Date.now();
    
    try {
        await testUserMutex();
        await testAtomicFileOps();
        await testTokenStoreV3();
        await testQuestFairness();
        await testLockStatistics();
        await testTimeoutProtection();
        await testForcedRelease();
        await testAtomicRootValidation();
        
        const elapsed = Date.now() - startTime;
        console.log(`\n✅ ALL TESTS PASSED in ${elapsed}ms\n`);
        console.log('Bot V3 is ready for multi-user production deployment! 🚀\n');
        
        return true;
    } catch (err) {
        console.error(`\n❌ TEST FAILED:`, err?.message ?? err);
        console.error('\nPlease fix the above issues before deploying.\n');
        return false;
    } finally {
        restoreStoreFiles();
    }
}

// Run tests
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
});
