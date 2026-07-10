window.Sync = (function () {
  const SUPABASE_URL      = 'https://frjxcdqtfxntkoywvenq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyanhjZHF0ZnhudGtveXd2ZW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjEyNjcsImV4cCI6MjA5ODU5NzI2N30.GxTJii5zVsGf2fOxYKP7SBIWkoupFsdI-2xol8i3TUg';

  let _client  = null;
  let _session = null;
  

  function client() {
    if (!_client) _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }
// captura token do redirect OAuth
  if (window.location.hash.includes('access_token')) {
    setTimeout(function() {
      client().auth.getSession();
      history.replaceState(null, '', window.location.pathname);
    }, 500);
  }
  async function signInWithGoogle() {
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }

  async function signOut() {
    await client().auth.signOut();
    _session = null;
  }

  async function getSession() {
    if (_session) return _session;
    const { data } = await client().auth.getSession();
    _session = data.session;
    return _session;
  }

  function onAuthChange(callback) {
    client().auth.onAuthStateChange(function(_event, session) {
      _session = session;
      callback(session);
    });
  }

  function isLoggedIn() { return !!_session; }
  function currentUser() { return _session ? _session.user : null; }

  async function uploadPhoto(localPhoto) {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const uid = session.user.id;

    const meta = Object.assign({}, localPhoto);
    delete meta.blob; delete meta.objectUrl; delete meta.thumbBlob; delete meta.thumbUrl; delete meta.originalBlob;

    async function uploadBlobFresh() {
      if (!localPhoto.blob) return localPhoto.storagePath || null;
      const ext = (localPhoto.fileName || 'jpg').split('.').pop();
      const path = uid + '/' + localPhoto.id + '_' + Date.now() + '.' + ext;
      const { error } = await client().storage.from('photos').upload(path, localPhoto.blob, { upsert: true });
      if (error) throw error;
      return path;
    }

    async function insertFresh() {
      const storagePath = await uploadBlobFresh();
      const { data: inserted, error: insError } = await client().from('photos').insert({
        user_id: uid,
        object_id: localPhoto.objectId,
        storage_path: storagePath,
        data: Object.assign({}, meta, { storagePath: storagePath }),
      }).select('id').single();
      if (insError) throw insError;
      await window.DB.updatePhoto(localPhoto.id, { remoteId: inserted.id });
    }

    if (localPhoto.remoteId) {
      // só metadados aqui — a linha (e o arquivo) presumivelmente já existem
      const { data: updated, error } = await client().from('photos').update({
        data: Object.assign({}, meta, { storagePath: localPhoto.storagePath || null }),
        updated_at: new Date().toISOString(),
      }).eq('id', localPhoto.remoteId).select('id');
      if (error) throw error;
      if (!updated || !updated.length) {
        // remoteId órfão (linha não existe mais na nuvem, ex: depois de um wipe) — reenvia o arquivo do zero
        await insertFresh();
      }
    } else {
      await insertFresh();
    }
  }

  async function uploadObject(obj) {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const { error } = await client().from('objects').upsert({ id: obj.id, user_id: session.user.id, data: obj, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async function deletePhoto(remoteId) {
    const session = await getSession();
    if (!session || !remoteId) return;
    const { data: row } = await client().from('photos').select('storage_path').eq('id', remoteId).maybeSingle();
    if (!row) return;
    if (row.storage_path) {
      await client().storage.from('photos').remove([row.storage_path]);
    }
    await client().from('photos').delete().eq('id', remoteId);
  }

  async function wipeRemotePhotos() {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const uid = session.user.id;
    const { data: files } = await client().storage.from('photos').list(uid);
    if (files && files.length) {
      await client().storage.from('photos').remove(files.map(f => uid + '/' + f.name));
    }
    await client().from('photos').delete().eq('user_id', uid);
  }

  async function fullSync(onProgress) {
    const session = await getSession();
    if (!session) return { skipped: true };
    if (onProgress) onProgress('Baixando catálogo...');
    const { data: objs } = await client().from('objects').select('data').eq('user_id', session.user.id);
    for (var i = 0; i < (objs || []).length; i++) await window.DB.upsertObject(objs[i].data);
    if (onProgress) onProgress('Baixando sessões...');
    const { data: photos } = await client().from('photos').select('id,storage_path,data').eq('user_id', session.user.id).order('added_at', { ascending: true });
    const local = await window.DB.getAllPhotos();

    function sigOf(objectId, captureDate, fileName) {
      return objectId + '|' + captureDate + '|' + (fileName || '');
    }
    const byRemoteId = {};
    const bySignature = {};
    local.forEach(function (p) {
      if (p.remoteId) byRemoteId[p.remoteId] = p;
      bySignature[sigOf(p.objectId, p.captureDate, p.fileName)] = p;
    });

    let n = 0;
    for (var j = 0; j < (photos || []).length; j++) {
      const rp = photos[j];
      const sig = sigOf(rp.data.objectId, rp.data.captureDate, rp.data.fileName);
      const localMatch = byRemoteId[rp.id] || bySignature[sig] || null;

      if (localMatch) {
        const updates = {};
        if (!localMatch.remoteId) updates.remoteId = rp.id;
        if (!(localMatch.blob instanceof Blob) && rp.storage_path) {
          if (onProgress) onProgress('Baixando foto ' + (++n) + '...');
          try {
            const { data, error } = await client().storage.from('photos').download(rp.storage_path);
            if (error) console.warn('[Sync] Falha ao baixar foto', rp.storage_path, error);
            if (data) updates.blob = data;
          } catch (e) {
            console.warn('[Sync] Falha ao baixar foto', rp.storage_path, e);
          }
        }
        if (Object.keys(updates).length) await window.DB.updatePhoto(localMatch.id, updates);
        byRemoteId[rp.id] = localMatch;
        continue;
      }

      if (onProgress) onProgress('Baixando foto ' + (++n) + '...');
      let blob = null;
      if (rp.storage_path) {
        try {
          const { data, error } = await client().storage.from('photos').download(rp.storage_path);
          if (error) console.warn('[Sync] Falha ao baixar foto', rp.storage_path, error);
          blob = data;
        } catch (e) {
          console.warn('[Sync] Falha ao baixar foto', rp.storage_path, e);
        }
      }
      var photoData = Object.assign({}, rp.data, { blob: blob, remoteId: rp.id });
      delete photoData.id;
      const newId = await window.DB.addPhoto(photoData);
      bySignature[sig] = { id: newId, objectId: photoData.objectId, captureDate: photoData.captureDate, fileName: photoData.fileName, remoteId: rp.id };
    }
    return { objects: (objs || []).length, newPhotos: n };
  }

  const BACKUP_RETENTION = 7;
  const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function autoBackupIfDue() {
    const session = await getSession();
    if (!session) return;
    const uid = session.user.id;
    const lastRun = Number(localStorage.getItem('s30-last-auto-backup') || 0);
    if (Date.now() - lastRun < BACKUP_INTERVAL_MS) return;

    const data = await window.DB.exportAll();
    const path = `${uid}/backups/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const { error } = await client().storage.from('photos').upload(path, blob);
    if (error) { console.warn('[Sync] Backup automático falhou:', error); return; }

    localStorage.setItem('s30-last-auto-backup', String(Date.now()));

    const { data: list } = await client().storage.from('photos').list(`${uid}/backups`);
    if (list && list.length > BACKUP_RETENTION) {
      const sorted = list.sort((a, b) => a.name.localeCompare(b.name));
      const toDelete = sorted.slice(0, sorted.length - BACKUP_RETENTION).map((f) => `${uid}/backups/${f.name}`);
      await client().storage.from('photos').remove(toDelete);
    }
  }

  async function pushAll(onProgress) {
    const session = await getSession();
    if (!session) return { skipped: true };
    const objects = await window.DB.getAllObjects();
    if (onProgress) onProgress('Enviando ' + objects.length + ' objetos...');
    for (var i = 0; i < objects.length; i++) await uploadObject(objects[i]);
    const photos = await window.DB.getAllPhotos();
    for (var j = 0; j < photos.length; j++) {
      if (onProgress) onProgress('Enviando foto ' + (j+1) + '/' + photos.length + '...');
      await uploadPhoto(photos[j]);
    }
    return { objects: objects.length, photos: photos.length };
  }

  return { signInWithGoogle: signInWithGoogle, signOut: signOut, getSession: getSession, onAuthChange: onAuthChange, isLoggedIn: isLoggedIn, currentUser: currentUser, uploadPhoto: uploadPhoto, uploadObject: uploadObject, deletePhoto: deletePhoto, wipeRemotePhotos: wipeRemotePhotos, autoBackupIfDue: autoBackupIfDue, fullSync: fullSync, pushAll: pushAll };
})();