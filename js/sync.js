window.Sync = (function () {
  const SUPABASE_URL      = 'https://frjxcdqtfxntkoywvenq.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZyanhjZHF0ZnhudGtveXd2ZW5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjEyNjcsImV4cCI6MjA5ODU5NzI2N30.GxTJii5zVsGf2fOxYKP7SBIWkoupFsdI-2xol8i3TUg';

  let _client  = null;
  let _session = null;

  function client() {
    if (!_client) _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _client;
  }

  async function signInWithGoogle() {
    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
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
    let storagePath = null;
    if (localPhoto.blob) {
      const ext = (localPhoto.fileName || 'jpg').split('.').pop();
      storagePath = uid + '/' + localPhoto.id + '_' + Date.now() + '.' + ext;
      const { error } = await client().storage.from('photos').upload(storagePath, localPhoto.blob, { upsert: true });
      if (error) throw error;
    }
    const meta = Object.assign({}, localPhoto);
    delete meta.blob; delete meta.objectUrl;
    const { data: existing } = await client().from('photos').select('id').eq('user_id', uid).eq('local_id', localPhoto.id || 0).maybeSingle();
    if (existing) {
      await client().from('photos').update({ storage_path: storagePath, data: Object.assign({}, meta, { storagePath: storagePath }), updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      const { error } = await client().from('photos').insert({ local_id: localPhoto.id || null, user_id: uid, object_id: localPhoto.objectId, storage_path: storagePath, data: Object.assign({}, meta, { storagePath: storagePath }) });
      if (error) throw error;
    }
  }

  async function uploadObject(obj) {
    const session = await getSession();
    if (!session) throw new Error('Não autenticado');
    const { error } = await client().from('objects').upsert({ id: obj.id, user_id: session.user.id, data: obj, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async function fullSync(onProgress) {
    const session = await getSession();
    if (!session) return { skipped: true };
    if (onProgress) onProgress('Baixando catálogo...');
    const { data: objs } = await client().from('objects').select('data').eq('user_id', session.user.id);
    for (var i = 0; i < (objs || []).length; i++) await window.DB.upsertObject(objs[i].data);
    if (onProgress) onProgress('Baixando sessões...');
    const { data: photos } = await client().from('photos').select('local_id,storage_path,data').eq('user_id', session.user.id).order('added_at', { ascending: true });
    const local = await window.DB.getAllPhotos();
    const localIds = new Set(local.map(function(p) { return p.id; }));
    let n = 0;
    for (var j = 0; j < (photos || []).length; j++) {
      const rp = photos[j];
      if (localIds.has(rp.local_id)) continue;
      if (onProgress) onProgress('Baixando foto ' + (++n) + '...');
      let blob = null;
      if (rp.storage_path) { try { const { data } = await client().storage.from('photos').download(rp.storage_path); blob = data; } catch(e) {} }
      await window.DB.addPhoto(Object.assign({}, rp.data, { blob: blob, id: undefined }));
    }
    return { objects: (objs||[]).length, newPhotos: n };
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

  return { signInWithGoogle: signInWithGoogle, signOut: signOut, getSession: getSession, onAuthChange: onAuthChange, isLoggedIn: isLoggedIn, currentUser: currentUser, uploadPhoto: uploadPhoto, uploadObject: uploadObject, fullSync: fullSync, pushAll: pushAll };
})();