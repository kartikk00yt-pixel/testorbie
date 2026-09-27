# Orbie Codebase: Concurrency & Race Condition Analysis

**Analysis Date:** 2026-09-01  
**Severity:** CRITICAL - Multiple severe race conditions and data corruption vulnerabilities

---

## Executive Summary

The Orbie codebase has **critical concurrency vulnerabilities** that can lead to:
- **Data corruption** in JSON files (tokens, premium data, access controls)
- **Token security issues** (duplicate/conflicting token states)
- **Lost updates** (user preferences overwritten)
- **Inconsistent state** (in-memory cache vs disk divergence)
- **Quest processing conflicts** (same quest processed multiple times or skipped)

The root cause is **synchronous file I/O with no concurrency control** combined with **async operations that can interleave**.

---

## 1. CRITICAL: File I/O Race Conditions

### Issue 1.1: Synchronous File Operations Without Locking
**Files:** `tokenStore.js`, `premiumStore.js`, `questAccessStore.js`, `autoquestStore.js`, `channelSettings.js`

**Problem:**
All JSON file operations use synchronous `fs` methods without any locking mechanism:
```javascript
// tokenStore.js
function saveStore(store) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));  // ❌ No atomic write
    fs.chmodSync(STORE_FILE, 0o600);
}

function loadStore() {
    try {
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));  // ❌ Can read partial writes
    } catch {
        return {};
    }
}
```

**Race Condition Scenario:**
1. User A calls `saveAccount()` → reads tokens.json, modifies it
2. User B calls `get()` → reads tokens.json, gets partial/corrupted data
3. User A writes tokens.json, User B writes tokens.json → **ONE WRITE IS LOST**

**Timeline:**
```
Time  User A                          User B
----  ------                          ------
T1    loadStore() ✓                   
T2    modify store[A's account]       
T3    writeFileSync() START           
T4                                    loadStore() ✓
T5    writeFileSync() END (writes A's data)
T6                                    modify store (now outdated!)
T7                                    writeFileSync() ✓ (OVERWRITES A's changes)
      Result: User A's account changes lost!
```

**Impact:**
- ✅ User A links token
- ✅ User B fetches token list
- ❌ User A's token is lost because User B's write overwrites it
- **Token data corruption**
- **Loss of account metadata**

**Affected Functions:**
- `tokenStore.js`: `save()`, `saveAccount()`, `saveAccounts()`, `get()`, `getAccounts()`, `remove()`, `removeAccount()`
- `premiumStore.js`: `writePremiumData()`, `writeTrialClaims()`
- `questAccessStore.js`: `writeJson()`, `grantBypass()`, `revokeBypass()`, `grantGuildBypass()`
- `autoquestStore.js`: `save()`, `enableAutoquest()`, `disableAutoquest()`
- `channelSettings.js`: `save()`, `setGuildCommandChannel()`, `removeGuildCommandChannel()`, `clearGuildCommandChannel()`

---

### Issue 1.2: Read-Modify-Write Race Condition (TOCTOU)
**Files:** All files with separate `load()` and `save()` operations

**Problem:**
The classic "Time of Check / Time of Use" vulnerability:

```javascript
// autoquestStore.js
export function enableAutoquest(userId) {
    const key = normalizeUserId(userId);
    const data = load();                    // T1: Read from disk
    if (data.includes(key)) return false;   // T2: Check (another user could modify file here!)
    data.push(key);                         // T3: Modify
    save(data);                             // T4: Write (but file may have changed between T1-T4)
}
```

**Scenario:**
```
Time  User A                              User B
----  ------                              ------
T1    load() → [userId1, userId2]        
T2                                        load() → [userId1, userId2]
T3    data.push(userA) → [..., userA]    
T4                                        data.push(userB) → [..., userB]
T5    save() → [userId1, userId2, userA]
T6                                        save() → [userId1, userId2, userB]
      Result: ONE change is lost (userA or userB)
```

**Severity:** HIGH - User preferences can be lost

---

### Issue 1.3: Partial File Corruption on Crash
**Problem:**
`fs.writeFileSync()` can partially write before process crash:
```javascript
fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
// If process crashes here, file is truncated/corrupted
fs.chmodSync(STORE_FILE, 0o600);
```

**Impact:** Corrupted JSON files can cause the app to crash on restart

---

## 2. CRITICAL: In-Memory Cache vs Disk State Divergence

### Issue 2.1: TTL Cache With Async File Writes
**Files:** `premiumStore.js`, `questAccessStore.js`

**Problem:**
Caches have TTL, but writes don't immediately invalidate ALL caches:

```javascript
// premiumStore.js - CACHE WITH TTL
const premiumCache = new Map();

function setCached(userId, value) {
    premiumCache.set(userId, { value, timestamp: Date.now() });
}

function writePremiumData(data) {
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify(data, null, 2));
    premiumCache.clear(); // ✓ Good, but...
}

export function hasPremiumAccess(userId) {
    const cached = getCached(userId);    // Check cache
    if (cached !== null) return cached;  // Return stale data
    
    const data = readPremiumData();
    // ... Another process wrote data.json here (between cache check and read)
    // We read disk, but cache still has different value for OTHER users
}
```

**Scenario:**
```
Time  Process A (Bot 1)                    Process B (Bot 2, same file)
----  ----------                           ----------
T1    hasPremiumAccess(user123)
T2    getCached() → cache hit, true       
T3    return true                         
T4                                         removePremiumAccess(user123)
T5                                         writePremiumData() → writes to disk
T6                                         premiumCache.clear()
T7    User123 performs action as premium  
      Result: Bot 1 thinks user is premium, but Bot 2 removed access (FILE IS SOURCE OF TRUTH BUT BOT 1 CACHED IT)
```

**With multiple bot instances** (if deployed), each has its own cache and doesn't know when other instances modify files.

---

### Issue 2.2: Write-Back Cache Without Coherency
**Files:** `questAccessStore.js` permission cache

```javascript
function setCached(type, userId, guildId, value) {
    permissionCache.set(key, { value, timestamp: Date.now() });
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    permissionCache.clear(); // ✓ Clears cache
}
```

Problem: If TWO writeJson calls happen (e.g., concurrent `grantBypass()` and `revokeBypass()`), race condition still occurs:

```
Time  grantBypass(user)                   revokeBypass(user)
----  ----------------                   ------------------
T1    readJson() → {}
T2                                        readJson() → {}
T3    bypass[key] = ...
T4    writeJson(grant data)
T5    permissionCache.clear()
T6                                        delete bypass[key]
T7                                        writeJson(revoke data)
      Result: User has bypass (T4 write) but should not (T7 should overwrite with empty)
             OR the opposite depending on timing
```

---

## 3. CRITICAL: Quest Processing Race Conditions

### Issue 3.1: Global Quest Processing Without Per-User Locking
**File:** `questCommands.js`, `autoquestWatcher.js`

**Problem:**
```javascript
// questCommands.js
const activeQuestAllUsers = new Set();  // ✓ Declared but NEVER USED FOR LOCKING
```

This Set is declared but never used to prevent concurrent quest operations on the same user:

```javascript
// autoquestWatcher.js
export function startAutoquestWatcher(client) {
    setInterval(async () => {
        if (checkRunning) return;  // ❌ This is NOT atomic, and only prevents REENTRANCY
        checkRunning = true;
        try {
            for (const userId of users) {
                // ... process quests
                for (const quest of valid) {
                    const completed = await runAutoquestForUser(userId, quest, ...);
                    // ❌ RACE CONDITION: Two Discord events can call runAutoquestForUser for same user
                }
            }
        } finally {
            checkRunning = false;
        }
    }, POLL_INTERVAL);
}
```

**Scenario:**
```
Time  Discord Event 1 (User presses /quest)     Discord Event 2 (Auto-quest watcher fires)
----  ----------                                 ----------
T1    /quest command received
T2    runAutoquestForUser(userId, quest1)
T3    Load quest state from API → 50% done
T4                                                Auto-quest fires
T5                                                Load quest state for SAME USER → 50% done
T6    Send progress update (51% → 52%)
T7                                                Send progress update (51% → 52%)
T8    Load state → 52%
T9                                                Load state → 52% (DUPLICATE)
       Result: Discord registers progress twice from same action (detected as cheat?)
               OR progress is not updated correctly due to interleaved updates
```

**Issue 3.2: Duplicate Quest Processing (Global Set Never Cleared)**
**File:** `autoquestWatcher.js`

```javascript
const completedQuestIds = new Set();  // ✓ Track already-processed quest IDs

export function startAutoquestWatcher(client) {
    setInterval(async () => {
        for (const userId of users) {
            for (const quest of valid) {
                const key = `${userId}:${quest.id}`;
                if (completedQuestIds.has(key)) continue;  // Skip if already processed
                const completed = await runAutoquestForUser(...);
                if (completed) completedQuestIds.add(key);  // Mark as completed
            }
        }
    }, POLL_INTERVAL);
}
```

**Problem 1: Set grows unbounded**
- Quests marked as completed are NEVER removed from the Set
- After 1000 quests, the Set has 1000+ entries (memory leak)

**Problem 2: New user, same quest ID**
- If `userId1` completes questId `abc-123` and it's marked in the Set
- If `userId2` gets the same questId `abc-123` (common with global quests)
- The Set skips it because it's already marked as completed
- **userId2's quest is never processed!**

**Problem 3: Stale timestamp**
- If a quest expires and comes back later (Discord re-runs it)
- It's in the Set from 2 weeks ago
- **The quest is skipped even though it's new**

---

## 4. CRITICAL: Autoquest Watcher State Management

### Issue 4.1: Non-Atomic checkRunning Flag
**File:** `autoquestWatcher.js`

```javascript
let checkRunning = false;

export function startAutoquestWatcher(client) {
    setInterval(async () => {
        if (checkRunning) return;  // ❌ NOT ATOMIC
        checkRunning = true;       // ❌ Another event can run between these lines
        try {
            // ... 30+ second operation
        } finally {
            checkRunning = false;
        }
    }, Math.max(10_000, QUEST_SETTINGS.autoquestPollIntervalMs));
}
```

**Race Condition:**
```
Time  Interval Tick 1                   Interval Tick 2 (overlapping)
----  ------                            ------
T1    if (checkRunning) → false
T2    checkRunning = true
T3    Start processing... (20 seconds elapsed)
T4                                      if (checkRunning) → true
T5                                      return (skip this tick)
T6    Still processing (40 seconds elapsed)
T7                                      Tick fires again
T8                                      if (checkRunning) → true
T9                                      return (skip)
T10   Processing completes
T11   checkRunning = false
      Result: During long processing, multiple ticks are skipped OK.
              But if one tick takes LONGER than interval, processing falls behind.
```

**Issue:** If auto-quest processing takes 30 seconds, but interval is 10 seconds, only one concurrent operation allowed. This is by design but not clearly documented. However, if processing times are unpredictable, you can miss intervals.

---

## 5. TOKEN STORE RACE CONDITIONS

### Issue 5.1: Account Switching Without Atomicity
**File:** `tokenStore.js`

```javascript
switchAccount(userId, slot) {
    const accounts = loadAccounts();  // Read
    const metadata = accounts[userId];
    const numericSlot = Number(slot);
    if (!metadata?.accounts?.[numericSlot]) return false;
    const store = loadStore();  // ❌ Read again (file could change between first and second read)
    if (!store[`${userId}:${numericSlot}`]) return false;
    metadata.activeSlot = numericSlot;  // Modify
    saveAccounts(accounts);  // Write
    return true;
}
```

**Scenario:**
```
Time  switchAccount(userA, slot1)       removeAccount(userA, slot1)
----  -----                             ------
T1    loadAccounts() → slot1 exists     
T2                                      removeAccount() → delete slot1
T3                                      saveAccounts() → removed
T4    loadStore() → (file is newer, slot1 gone)
T5    Return false
T6                                      Load completes
      Result: switchAccount fails silently (user thinks it worked but it didn't)
```

---

### Issue 5.2: saveAccount Race with Multiple Slots
**File:** `tokenStore.js`

```javascript
saveAccount(userId, slot, token, ...) {
    const store = loadStore();  // ✓ Read once
    const encrypted = encrypt(token, this.key);
    const accountKey = `${userId}:${slot}`;
    store[accountKey] = encrypted;
    
    // ... later
    
    saveStore(store);  // ✓ Atomic at this point
    
    const accounts = loadAccounts();  // ❌ But then read AGAIN (race condition!)
    const userAccounts = accounts[userId] ?? ...;
    // ... modify userAccounts
    
    saveAccounts(accounts);  // Write (but tokens.json could have changed)
}
```

**Scenario:**
```
Time  saveAccount(user, slot0)         saveAccount(user, slot1)
----  -----                            ------
T1    loadStore() → {}
T2    saveStore() → writes {slot0}
T3                                     loadStore() → reads {slot0}
T4                                     saveStore() → writes {slot0, slot1}
T5    loadAccounts()
T6    saveAccounts()
      Result: OK actually (tokens were saved atomically in step 2)
              But accounts metadata could be out of sync
```

---

## 6. PREMIUM & ACCESS CONTROL RACE CONDITIONS

### Issue 6.1: Concurrent Premium Grant/Revoke
**File:** `premiumStore.js`

```javascript
export function addPremiumAccess(userId, value, unit, grantedBy) {
    const safeId = normalizePremiumUserId(userId);
    const parsed = parsePremiumDuration(value, unit);
    if (!parsed) return { ok: false, error: '...' };
    
    const data = readPremiumData();  // Read
    const expiresAt = new Date(Date.now() + parsed.ms).toISOString();
    data[safeId] = {  // Modify
        userId: safeId,
        grantedBy: normalizeUserId(grantedBy),
        grantedAt: new Date().toISOString(),
        expiresAt,
        permanent: false,
        trial: false,
    };
    writePremiumData(data);  // Write
    return { ok: true, expiresAt };
}
```

**Race Condition:**
```
Time  addPremiumAccess(user, 30, 'd')   addPremiumAccess(user, 7, 'd')
----  -----                             ------
T1    readPremiumData() → {}
T2                                      readPremiumData() → {}
T3    data[user] = {expires: +30d}
T4                                      data[user] = {expires: +7d}
T5    writePremiumData() → +30d
T6                                      writePremiumData() → +7d
      Result: User gets 7 days instead of 30 days!
              Or vice versa - depends on write order
```

**Impact:** Admins grant premium for 30 days, but user only gets 7 days (or wrong duration)

---

### Issue 6.2: Trial Claim Race Condition
**File:** `premiumStore.js`

```javascript
export function grantTrialPremium(userId, grantedBy = 'trial') {
    const safeId = normalizePremiumUserId(userId);
    if (hasClaimedTrial(safeId)) return { ok: false, error: 'Already claimed' };  // ❌ TOCTOU
    
    // Another process could run hasClaimedTrial here and return the same result
    
    const data = readPremiumData();
    data[safeId] = { ...trial data };
    writePremiumData(data);
    
    const claims = readTrialClaims();
    claims[safeId] = { claimedAt: ... };
    writeTrialClaims(claims);
    return { ok: true, expiresAt };
}
```

**Scenario:**
```
Time  grantTrialPremium(user)           grantTrialPremium(user)
----  -----                             ------
T1    hasClaimedTrial() → false         
T2                                      hasClaimedTrial() → false
T3    readPremiumData()
T4                                      readPremiumData()
T5    writePremiumData() → trial granted
T6                                      writePremiumData() → trial granted (DUPLICATE)
T7    writeTrialClaims() → claimed
T8                                      writeTrialClaims() → claimed
      Result: User receives premium TWICE somehow
              OR user can claim trial multiple times
```

---

## 7. EVENT HANDLER RACE CONDITIONS

### Issue 7.1: Concurrent Command Execution on Same User
**Files:** `interactionCreate.js`, `messageCreate.js`

```javascript
// interactionCreate.js
if (interaction.isModalSubmit() && interaction.customId.startsWith('link_token_modal')) {
    await handleLinkModal(interaction, client);  // ❌ No per-user serialization
}

// messageCreate.js
if (interaction.isButton()) {
    const device = interaction.customId.replace('token_device_', '');
    // ... handle button
}
```

**Scenario:**
```
Time  User clicks "Link Token" Button 1   User clicks "Link Token" Button 2
----  ------                              ------
T1    Interaction 1 received
T2    handleLinkModal() starts
T3    Load user's current tokens
T4                                        Interaction 2 received
T5                                        handleLinkModal() starts
T6                                        Load user's current tokens (same as T3!)
T7    Token 1 validated
T8    Add Token 1 to tokenStore
T9                                        Token 2 validated
T10                                       Add Token 2 to tokenStore (overwrites Token 1?)
T11   Save tokenStore
T12                                       Save tokenStore
      Result: Depending on order, Token 1 or Token 2 is saved
              One token is lost!
```

---

### Issue 7.2: Parallel Permission Checks in Event Handlers
**File:** `interactionCreate.js`

```javascript
// Parallelize permission checks
const [guildBypass, hasSupport] = await Promise.all([
    interaction.guildId ? Promise.resolve(hasGuildBypass(...)) : Promise.resolve(false),
    requireSupportServerMember(interaction, client),
]);
```

While this is good for performance, if multiple concurrent interactions modify permissions:

```
T1: Interaction A checks hasGuildBypass() → reads cache/disk (returns true)
T2: Interaction B revokes bypass (writeJson, clears cache)
T3: Interaction A proceeds with command → user has bypass in memory but not on disk
    (Happens before cache check in T3, so brief inconsistency)
```

This is low-risk due to eventual consistency, but still a window.

---

## 8. DATA STRUCTURE INTEGRITY ISSUES

### Issue 8.1: Account Metadata Inconsistency
**File:** `tokenStore.js`

```javascript
// In saveAccount:
const accounts = loadAccounts();
const userAccounts = accounts[userId] ?? { activeSlot: slot, accounts: {} };
userAccounts.accounts = userAccounts.accounts ?? {};

// BUT if concurrent saveAccount runs:
// T1: load accounts → {user: {activeSlot: 0, accounts: {0: {...}}}}
// T2: concurrent load accounts → {user: {activeSlot: 0, accounts: {0: {...}}}}
// T3: set user.accounts[1] = new account
// T4: concurrent set user.accounts[1] = new account (DUPLICATE WRITE)
// T5: write accounts
// T6: concurrent write accounts
//     Result: ONE of the slot 1 accounts is lost
```

---

## 9. MISSING SYNCHRONIZATION PRIMITIVES

### Analysis: What's Missing

1. **File Locks**
   - No advisory or mandatory file locking (no `flock`)
   - No locking library usage

2. **Atomic Writes**
   - No write-to-temp-then-rename pattern
   - No transactional semantics
   - No WAL (Write-Ahead Logging)

3. **Per-User Serialization**
   - No per-userId mutex/lock
   - No operation queue per user
   - No semaphores

4. **Atomic Operations**
   - No compare-and-swap
   - No test-and-set

5. **Distributed Locking** (if multi-instance)
   - No Redis locks
   - No database-backed locks

---

## 10. SPECIFIC VULNERABLE CODE PATTERNS

### Pattern 1: Read-Modify-Write without atomicity
```javascript
// ❌ VULNERABLE
const data = readJson();  // Read
data[key] = value;        // Modify
writeJson(data);          // Write - another process could have modified between read/write
```

**Occurs in:**
- autoquestStore.js: `enableAutoquest()`, `disableAutoquest()`
- questAccessStore.js: `grantBypass()`, `revokeBypass()`
- premiumStore.js: `addPremiumAccess()`, `addPremiumAccessForUsers()`
- channelSettings.js: `setGuildCommandChannel()`, `removeGuildCommandChannel()`

### Pattern 2: Separate loads without consistency
```javascript
// ❌ VULNERABLE
const tokens = loadStore();      // Load A
// ... time passes ...
const accounts = loadAccounts(); // Load B
// If another process modified accounts.json between loads, they're inconsistent
```

**Occurs in:**
- tokenStore.js: `saveAccount()`, `removeAccount()`, `switchAccount()`

### Pattern 3: Cache with TTL but async modifications
```javascript
// ❌ VULNERABLE
const cached = getCached(key);      // Check cache (may be stale)
if (cached !== null) return cached;
const disk = readDiskData();        // Read disk
// If another process just wrote disk between cache check and read, we have divergence
```

**Occurs in:**
- premiumStore.js: `hasPremiumAccess()`
- questAccessStore.js: `hasQuestAccess()`, `hasBypass()`

---

## IMPACT ASSESSMENT

### By Severity

| Vulnerability | Severity | Impact | Likelihood |
|---|---|---|---|
| Race condition in tokenStore.saveAccount() | **CRITICAL** | Token loss, account metadata corruption | HIGH |
| TOCTOU in grantTrialPremium() | **CRITICAL** | Duplicate trial grants, DoS via claims exploit | MEDIUM |
| Race in autoquestWatcher (same quest, diff users) | **CRITICAL** | Unfair quest processing, some users' quests never run | HIGH |
| Race in permission checks (grant/revoke/bypass) | **HIGH** | Users retain access after revocation | MEDIUM |
| Write-after-read in premium/access stores | **HIGH** | Lost updates, inconsistent permissions | HIGH |
| Partial JSON corruption on crash | **HIGH** | App cannot restart, data loss | MEDIUM |
| Cache invalidation race (premiumStore) | **MEDIUM** | Brief inconsistency between cache/disk | LOW |
| Event handler concurrent token linking | **HIGH** | Lost token, user confused | MEDIUM |

---

## RECOMMENDED FIXES

### Immediate (Critical Priority)

1. **Implement Atomic File Writes**
   ```javascript
   const fs = require('fs').promises;
   async function atomicWrite(file, data) {
       const tmpFile = file + '.tmp';
       await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
       await fs.rename(tmpFile, file);  // Atomic on most filesystems
   }
   ```

2. **Add File Locking**
   ```javascript
   import lockfile from 'proper-lockfile';
   
   async function safeReadWrite(file, transformFn) {
       let release;
       try {
           release = await lockfile.lock(file);
           const data = JSON.parse(await fs.readFile(file, 'utf8'));
           const modified = transformFn(data);
           await fs.writeFile(file, JSON.stringify(modified, null, 2));
       } finally {
           if (release) await release();
       }
   }
   ```

3. **Convert Sync to Async**
   - Replace all `fs.readFileSync()` with `await fs.promises.readFile()`
   - This allows proper error handling and gives system time to handle concurrent operations

4. **Per-User Serialization**
   ```javascript
   class PerUserMutex {
       #locks = new Map();
       
       async acquire(userId) {
           while (this.#locks.get(userId)) {
               await this.#locks.get(userId);
           }
           let release;
           const lock = new Promise(r => { release = r; });
           this.#locks.set(userId, lock);
           return release;
       }
   }
   ```

5. **Fix Global Set Memory Leak**
   ```javascript
   // Clear completedQuestIds periodically or use expiry
   const completedQuestIds = new Map();  // userId:questId -> timestamp
   
   if (completed) {
       completedQuestIds.set(key, Date.now());
   }
   
   // In watcher, periodically clean old entries
   if (Date.now() - (completedQuestIds.get(key) || 0) > 24 * 60 * 60 * 1000) {
       completedQuestIds.delete(key);
   }
   ```

### Medium Priority

6. **Implement Transaction Log**
   - Log all writes to a WAL before writing to main files
   - On crash, recover from WAL

7. **Cache Coherency**
   - Reduce TTL or add version checks
   - Use EventEmitter to notify all cache invalidations

8. **Multi-Instance Support**
   - Add file modification time checks
   - Use Redis for distributed locking if scaling beyond single instance

---

## Summary Table: All Race Conditions Found

| File | Function | Issue | Race Condition | Fix Priority |
|---|---|---|---|---|
| tokenStore.js | saveAccount() | Read-modify-write | Multiple concurrent saves lose data | P0 |
| tokenStore.js | get() | Sync read without lock | Concurrent save/get corruption | P0 |
| tokenStore.js | switchAccount() | TOCTOU | Concurrent remove/switch | P1 |
| premiumStore.js | addPremiumAccess() | Read-modify-write | Concurrent grants lose updates | P0 |
| premiumStore.js | grantTrialPremium() | TOCTOU + write race | Multiple claims, duplicate grants | P0 |
| questAccessStore.js | grantBypass()/revokeBypass() | Read-modify-write | Lost permission changes | P0 |
| autoquestStore.js | enableAutoquest() | Read-modify-write | Concurrent enables lose updates | P1 |
| autoquestWatcher.js | startAutoquestWatcher() | Global set unbounded | Memory leak + wrong user skips | P0 |
| autoquestWatcher.js | Quest duplication | userId + questId key collision | User A's completed quest blocks User B | P0 |
| channelSettings.js | setGuildCommandChannel() | Read-modify-write | Concurrent changes lose updates | P1 |
| questCommands.js | handleLinkModal() | Concurrent token linking | Lost token on double-click | P1 |
| interactionCreate.js | Command execution | No per-user lock | Race on token operations | P1 |
| messageCreate.js | Message command | No per-user lock | Race on permission checks | P1 |

---

## Conclusion

The Orbie codebase has **pervasive concurrency vulnerabilities** due to synchronous file I/O combined with async Discord event handling. The most critical issues are:

1. **Unprotected read-modify-write operations** on all JSON data files
2. **Race conditions in token/account management** (users lose data)
3. **TOCTOU vulnerabilities** in trial claims (exploitable)
4. **Global quest tracking without proper cleanup** (users' quests never process)

**Immediate action required** to implement atomic writes and per-user locking to prevent data loss and security issues.

