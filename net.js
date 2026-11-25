/* Noggin online layer: Firebase sign-in tied to this device, usernames,
   device keys for moving to a new phone, shared leaderboards/friends (Firestore),
   and live party rooms (Firestore documents).
   The game talks to this file through window.claude.use('db' | 'user' | 'room')
   and window.NET, so the game code stays the same whether or not Firebase is set up. */
const V = '10.12.2';
const cfg = window.FIREBASE_CONFIG;
const done = (api) => { if (window.__netResolve) window.__netResolve(api); };

if (!cfg || !cfg.apiKey || String(cfg.apiKey).includes('PASTE')) {
  done(null);
} else {
  start().catch(() => done(null));
}

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const { getAuth, signInAnonymously, onAuthStateChanged } = A;
  const { getFirestore, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, query, where, addDoc, arrayUnion } = F;
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const fs = getFirestore(app);

  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => [...crypto.getRandomValues(new Uint32Array(n))].map((x) => ALPHA[x % ALPHA.length]).join('');
  const PEER = 'p' + rand(10).toLowerCase();
  let uid = null, pid = null, key = null;

  const codeOf = (e) => ({ 'permission-denied': 'denied', unavailable: 'unavailable', 'not-found': 'notfound', 'already-exists': 'taken' }[e && e.code] || 'unavailable');
  const wrap = (e) => ({ code: codeOf(e), message: String((e && e.message) || e) });
  const clean = (v) => JSON.parse(JSON.stringify(v ?? null));
  const flat = (v) => { const o = {}; for (const k in v) { const x = v[k]; if (x && typeof x === 'object' && !Array.isArray(x)) { for (const s in x) o[k + '.' + s] = x[s]; } else o[k] = x; } return o; };
  const snapDoc = (d) => ({ id: d.id, exists: d.exists(), data: () => (d.exists() ? d.data() : undefined), metadata: { fromCache: d.metadata.fromCache, hasPendingWrites: d.metadata.hasPendingWrites } });

  /* ---------- db: same shape the game already uses ---------- */
  const docApi = (ref) => ({
    id: ref.id, path: ref.path,
    get: async () => { try { return snapDoc(await getDoc(ref)); } catch (e) { throw wrap(e); } },
    set: async (v) => { try { await setDoc(ref, clean(v)); } catch (e) { throw wrap(e); } },
    update: async (v) => { try { await updateDoc(ref, flat(clean(v))); } catch (e) { throw wrap(e); } },
    delete: async () => { try { await deleteDoc(ref); } catch (e) { throw wrap(e); } },
    onSnapshot: (n, er) => onSnapshot(ref, (d) => n(snapDoc(d)), (e) => er && er(wrap(e))),
  });
  const colApi = (path) => ({
    path,
    doc: (id) => docApi(id ? doc(fs, path, id) : doc(collection(fs, path))),
    onSnapshot: (n, er) => onSnapshot(collection(fs, path), (s) => n({ docs: s.docs.map(snapDoc), size: s.size, empty: s.empty, metadata: { fromCache: s.metadata.fromCache } }), (e) => er && er(wrap(e))),
  });
  const db = { collection: colApi, doc: (p) => docApi(doc(fs, p)) };

  /* ---------- rooms: presence docs + state doc + answer messages ---------- */
  const STALE = 30000;
  function roomApi(base, isLobby) {
    const presCol = isLobby ? 'lobby' : base + '/peers';
    let me = {}, peers = [], handlers = [], rawList = [], unsubs = [], hb = 0, pend = 0, left = false, peerSub = false;
    const t0 = Date.now();
    const writePres = async () => {
      if (!uid || left) return;
      try {
        if (isLobby && !me.party) { await deleteDoc(doc(fs, presCol, PEER)); return; }
        await setDoc(doc(fs, presCol, PEER), { by: uid, peer: PEER, presence: clean(me), at: Date.now() });
      } catch (e) {}
    };
    const compute = () => {
      const now = Date.now();
      const list = rawList.filter((r) => r && r.at > now - STALE && r.peer !== PEER)
        .map((r) => ({ peer: r.peer, by: r.by, isMe: r.by === uid, sameTab: false, kind: 'viewer', guest: false, presence: r.presence || {}, updatedAt: r.at }));
      list.push({ peer: PEER, by: uid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: { ...me }, updatedAt: now });
      const prev = new Map(peers.map((p) => [p.peer, p]));
      const joined = list.filter((p) => !prev.has(p.peer));
      const gone = peers.filter((p) => !list.find((q) => q.peer === p.peer));
      const updated = list.filter((p) => prev.has(p.peer));
      peers = list;
      handlers.forEach((h) => { try { h({ peers, joined, left: gone, updated }); } catch (e) {} });
    };
    const api = {
      name: base,
      connected: () => true,
      peers: () => peers,
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete me[k]; else me[k] = patch[k]; }
        clearTimeout(pend); pend = setTimeout(writePres, 250);
        if (!hb) hb = setInterval(writePres, 10000);
        return Promise.resolve();
      },
      onPeers(fn, er) {
        handlers.push(fn);
        if (!peerSub) {
          peerSub = true;
          unsubs.push(onSnapshot(collection(fs, presCol), (s) => { rawList = s.docs.map((d) => d.data()); compute(); }, (e) => er && er(wrap(e))));
          const iv = setInterval(compute, 5000); unsubs.push(() => clearInterval(iv));
        } else setTimeout(() => fn({ peers, joined: peers, left: [], updated: [] }), 0);
        return () => { handlers = handlers.filter((h) => h !== fn); };
      },
      emit(topic, data) {
        if (!uid || left) return Promise.resolve();
        if (topic === 'st') return setDoc(doc(fs, base + '/st', PEER), { by: uid, peer: PEER, data: clean(data), at: Date.now() }).catch(() => {});
        return addDoc(collection(fs, base + '/msgs'), { by: uid, peer: PEER, topic, data: clean(data), at: Date.now() }).catch(() => {});
      },
      on(topic, fn, er) {
        const deliver = (r) => fn({ topic, peer: r.peer, by: r.by, isMe: r.by === uid, sameTab: r.peer === PEER, kind: 'viewer', guest: false, data: r.data });
        let u;
        if (topic === 'st') {
          u = onSnapshot(collection(fs, base + '/st'), (s) => s.docChanges().forEach((c) => { if (c.type !== 'removed') deliver(c.doc.data()); }), (e) => er && er(wrap(e)));
        } else {
          u = onSnapshot(query(collection(fs, base + '/msgs'), where('at', '>', t0 - 2000)), (s) => s.docChanges().forEach((c) => { if (c.type === 'added') { const r = c.doc.data(); if (r.topic === topic) deliver(r); } }), (e) => er && er(wrap(e)));
        }
        unsubs.push(u); return u;
      },
      async leave() {
        left = true; peerSub = false; clearInterval(hb); clearTimeout(pend); unsubs.forEach((u) => { try { u(); } catch (e) {} }); unsubs = [];
        try { await deleteDoc(doc(fs, presCol, PEER)); } catch (e) {}
        if (!isLobby) { try { await deleteDoc(doc(fs, base + '/st', PEER)); } catch (e) {} }
      },
    };
    return api;
  }
  const lobby = roomApi('lobby', true);
  const joined = new Map();
  const room = {
    ...lobby,
    async join(name) {
      if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw { code: 'invalid_argument' };
      if (!joined.has(name) || joined.get(name).__left) joined.set(name, roomApi('rooms/' + name, false));
      const r = joined.get(name);
      const lv = r.leave; r.leave = async () => { r.__left = true; await lv(); };
      return r;
    },
  };
  addEventListener('pagehide', () => { lobby.leave(); joined.forEach((r) => r.leave()); });

  /* ---------- accounts tied to this device ---------- */
  const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,15}$/;
  const cleanName = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  async function nameFree(lower, mine) {
    const d = await getDoc(doc(fs, 'names', lower));
    return !d.exists() || d.data().pid === mine;
  }
  const NET = {
    pid: () => pid,
    key: () => key,
    uid: () => uid,
    async signup(name) {
      name = cleanName(name);
      if (!NAME_RE.test(name)) throw { code: 'badname' };
      if (pid) return NET.rename(name);
      const lower = name.toLowerCase();
      if (!(await nameFree(lower, uid))) throw { code: 'taken' };
      const k = rand(4) + '-' + rand(4) + '-' + rand(4), code = rand(6);
      const b = writeBatch(fs);
      b.set(doc(fs, 'owners', uid), { devices: [uid] });
      b.set(doc(fs, 'devmap', uid), { pid: uid, key: k });
      b.set(doc(fs, 'keys', k), { pid: uid });
      b.set(doc(fs, 'names', lower), { pid: uid });
      b.set(doc(fs, 'pf', uid), { name, code, friends: [] });
      try { await b.commit(); } catch (e) { const w = wrap(e); if (w.code === 'denied' && !(await nameFree(lower, uid))) w.code = 'taken'; throw w; }
      pid = uid; key = k; return pid;
    },
    async recover(k) {
      k = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (k.length !== 12) throw { code: 'badkey' };
      k = k.slice(0, 4) + '-' + k.slice(4, 8) + '-' + k.slice(8);
      let kd;
      try { kd = await getDoc(doc(fs, 'keys', k)); } catch (e) { throw wrap(e); }
      if (!kd.exists()) throw { code: 'badkey' };
      const p = kd.data().pid;
      const b = writeBatch(fs);
      b.set(doc(fs, 'devmap', uid), { pid: p, key: k });
      b.update(doc(fs, 'owners', p), { devices: arrayUnion(uid) });
      try { await b.commit(); } catch (e) { throw wrap(e); }
      pid = p; key = k; return pid;
    },
    async rename(name) {
      name = cleanName(name);
      if (!NAME_RE.test(name)) throw { code: 'badname' };
      const cur = await getDoc(doc(fs, 'pf', pid));
      const old = cur.exists() ? String(cur.data().name || '') : '';
      if (old === name) return pid;
      const lower = name.toLowerCase();
      if (!(await nameFree(lower, pid))) throw { code: 'taken' };
      const b = writeBatch(fs);
      if (old.toLowerCase() !== lower) {
        b.set(doc(fs, 'names', lower), { pid });
        if (old) b.delete(doc(fs, 'names', old.toLowerCase()));
      }
      b.update(doc(fs, 'pf', pid), { name });
      try { await b.commit(); } catch (e) { throw wrap(e); }
      return pid;
    },
  };
  window.NET = NET;

  const user = { id: async () => pid, isOwner: async () => false, canEdit: async () => false, can: async () => true, me: async () => ({ id: pid }) };
  const api = { use: (n) => (n === 'db' ? db : n === 'user' ? user : n === 'room' ? room : null) };

  let resolved = false;
  onAuthStateChanged(auth, async (u) => {
    if (!u) { try { await signInAnonymously(auth); } catch (e) { if (!resolved) { resolved = true; done(null); } } return; }
    uid = u.uid;
    try { const d = await getDoc(doc(fs, 'devmap', uid)); if (d.exists()) { pid = d.data().pid; key = d.data().key; } } catch (e) {}
    if (!resolved) { resolved = true; done(api); }
  });
}
